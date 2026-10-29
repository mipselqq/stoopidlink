package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

func TestOneBestPerGameAndGravityLevelPersists(t *testing.T) {
	s, path := testStore(t)
	post := func(body string) (int64, bool) {
		t.Helper()
		w := call(t, http.HandlerFunc(s.submitBest), "POST", "/api/games/best", body)
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body)
		}
		var out struct {
			Value   int64 `json:"value"`
			NewBest bool  `json:"newBest"`
		}
		json.Unmarshal(w.Body.Bytes(), &out)
		return out.Value, out.NewBest
	}
	for _, test := range []struct {
		body    string
		want    int64
		changed bool
	}{
		{`{"game":"tetris","level":0,"value":200}`, 200, true}, {`{"game":"tetris","level":0,"value":100}`, 200, false}, {`{"game":"tetris","level":0,"value":300}`, 300, true},
		{`{"game":"gravity","level":0,"value":15000}`, 15000, true}, {`{"game":"gravity","level":1,"value":12000}`, 12000, true}, {`{"game":"gravity","level":0,"value":18000}`, 15000, false}, {`{"game":"gravity","level":0,"value":13500}`, 13500, true},
	} {
		value, changed := post(test.body)
		if value != test.want || changed != test.changed {
			t.Fatal(value, changed, test)
		}
	}
	var count int
	s.db.QueryRow("SELECT count(*) FROM game_bests").Scan(&count)
	if count != 3 {
		t.Fatal("attempt history was stored", count)
	}
	s.db.Close()
	reopened, err := openStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.db.Close()
	w := call(t, reopened.routes(""), "GET", "/api/games/best/gravity/0", "")
	if w.Code != 200 || w.Body.String() != "{\"value\":13500}\n" {
		t.Fatal(w.Code, w.Body)
	}
}
func TestResultsAreStrictAndCannotCreateArbitraryKeys(t *testing.T) {
	s, _ := testStore(t)
	for _, body := range []string{
		`{"game":"chess","level":0,"value":1}`, `{"game":"gravity","level":30,"value":15000}`, `{"game":"gravity","level":-1,"value":15000}`, `{"game":"gravity","level":0,"league":2,"value":15000}`,
		`{"game":"tetris","level":1,"value":100}`, `{"game":"flappy","level":0,"value":1.5}`, `{"game":"flappy","level":0,"value":10001}`, `{"game":"tetris","level":0,"value":10000001}`, `{"game":"gravity","level":0,"value":14}`, `{"game":"gravity","level":0,"value":0}`, `{"game":"gravity","level":0,"value":3600015}`, `{"game":"x'); DROP TABLE voices;--","level":0,"value":100}`,
	} {
		w := call(t, http.HandlerFunc(s.submitBest), "POST", "/api/games/best", body)
		if w.Code != 400 {
			t.Fatal(body, w.Code, w.Body)
		}
	}
	var count int
	s.db.QueryRow("SELECT count(*) FROM game_bests").Scan(&count)
	if count != 0 {
		t.Fatal("invalid results saved")
	}
}
func TestConcurrentBestSubmissionsKeepOnlyTheMaximum(t *testing.T) {
	s, _ := testStore(t)
	var wg sync.WaitGroup
	for _, body := range []string{`{"game":"flappy","level":0,"value":2}`, `{"game":"flappy","level":0,"value":5}`, `{"game":"flappy","level":0,"value":3}`} {
		body := body
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := call(t, http.HandlerFunc(s.submitBest), "POST", "/api/games/best", body)
			if w.Code != 200 {
				t.Error(w.Code)
			}
		}()
	}
	wg.Wait()
	var count, value int
	s.db.QueryRow("SELECT count(*),max(value) FROM game_bests").Scan(&count, &value)
	if count != 1 || value != 5 {
		t.Fatal(count, value)
	}
}
func TestUnknownBestIsEmpty(t *testing.T) {
	s, _ := testStore(t)
	w := httptest.NewRecorder()
	s.routes("").ServeHTTP(w, httptest.NewRequest("GET", "/api/games/best/flappy/0", nil))
	if w.Code != 200 || w.Body.String() != "{\"value\":null}\n" {
		t.Fatal(w.Code, w.Body)
	}
}

func TestGameResultBounds(t *testing.T) {
	for _, test := range []struct {
		game  string
		value int64
		valid bool
	}{
		{"gravity", 15, false}, {"gravity", 990, false},
		{"gravity", 1000, false}, {"gravity", 1005, true},
		{"gravity", 5820, true}, {"gravity", 3600000, true}, {"gravity", 3600015, false},
		{"flappy", 1, true}, {"flappy", 10000, true}, {"flappy", 10001, false},
		{"tetris", 1, false}, {"tetris", 2, false}, {"tetris", 100, true}, {"tetris", 101, false},
		{"tetris", 10000000, true}, {"tetris", 10000002, false},
	} {
		t.Run(fmt.Sprintf("%s/%d", test.game, test.value), func(t *testing.T) {
			if got := validGameResult(gameResult{test.game, 0, test.value}); got != test.valid {
				t.Fatalf("valid=%v, want %v", got, test.valid)
			}
		})
	}
}

func TestAbsurdResultsCannotReplaceExistingBest(t *testing.T) {
	s, _ := testStore(t)
	h := http.HandlerFunc(s.submitBest)
	for _, body := range []string{
		`{"game":"gravity","level":0,"value":5820}`,
		`{"game":"flappy","level":0,"value":5}`,
		`{"game":"tetris","level":0,"value":100}`,
	} {
		if w := call(t, h, "POST", "/api/games/best", body); w.Code != 200 {
			t.Fatal(w.Code, w.Body)
		}
	}
	for _, body := range []string{
		`{"game":"gravity","level":0,"value":15}`,
		`{"game":"gravity","level":0,"value":990}`,
		`{"game":"gravity","level":0,"value":-15}`,
		`{"game":"tetris","level":0,"value":101}`,
		`{"game":"tetris","level":0,"value":10000002}`,
		`{"game":"flappy","level":0,"value":10001}`,
		`{"game":"flappy","level":0,"value":9223372036854775807}`,
		`{"game":"flappy","level":0,"value":9223372036854775808}`,
		`{"game":"flappy","level":0,"value":1e1000}`,
		`{"game":"flappy","level":0,"value":NaN}`,
		`{"game":"flappy","level":0,"value":1.5}`,
		`{"game":"flappy","level":0,"value":"100"}`,
		`{"game":"flappy","level":0,"value":null}`,
		`{"game":"flappy","level":0,"value":true}`,
		`{"game":"flappy","level":null,"value":100}`,
		`{"game":"flappy","value":100}`,
		`{"level":0,"value":100}`,
		`{"game":"flappy","level":0}`,
		`null`, `[]`,
		`{"game":"flappy","level":0,"value":100} {}`,
	} {
		if w := call(t, h, "POST", "/api/games/best", body); w.Code != 400 {
			t.Fatalf("accepted invalid result %s: %d %s", body, w.Code, w.Body)
		}
	}
	var count int
	if err := s.db.QueryRow("SELECT count(*) FROM game_bests").Scan(&count); err != nil || count != 3 {
		t.Fatal("invalid results changed record count", count, err)
	}
	for game, want := range map[string]int64{"gravity": 5820, "flappy": 5, "tetris": 100} {
		var got int64
		if err := s.db.QueryRow("SELECT value FROM game_bests WHERE game=? AND level=0", game).Scan(&got); err != nil || got != want {
			t.Fatal("invalid result overwrote record", game, got, err)
		}
	}
}
