package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestVoiceNameBoundsAndControlCharacters(t *testing.T) {
	for _, name := range []string{"", strings.Repeat("a", 41), "a\nb", "a\tb", "a\x00b", "a\u202eb", string([]byte{0xff})} {
		if validVoiceName(name) {
			t.Fatalf("invalid name accepted %q", name)
		}
	}
	for _, name := range []string{strings.Repeat("a", 40), "Название трека", "<img src=x onerror=alert(1)>"} {
		if !validVoiceName(name) {
			t.Fatalf("valid text rejected %q", name)
		}
	}
}
func TestSQLAndJSONInjectionStaysLiteral(t *testing.T) {
	s, _ := testStore(t)
	payload := "'); DROP TABLE voices;--"
	req := voiceRequest(t, "192.0.2.9:1234")
	data, _ := io.ReadAll(req.Body)
	data = bytes.Replace(data, []byte("Test clip"), []byte(payload), 1)
	req.Body = io.NopCloser(bytes.NewReader(data))
	req.ContentLength = int64(len(data))
	w := httptest.NewRecorder()
	s.routes("").ServeHTTP(w, req)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body)
	}
	var note voice
	if err := json.Unmarshal(w.Body.Bytes(), &note); err != nil || note.Name != payload {
		t.Fatal(err, w.Body)
	}
	var stored string
	if err := s.db.QueryRow("SELECT name FROM voices").Scan(&stored); err != nil || stored != payload {
		t.Fatal("SQL injection", err)
	}
	for _, body := range []string{`[{"x":0,"y":0,"color":2,"__proto__":{"polluted":true}}]`, `[{"x":"0);DROP TABLE voices;--","y":0,"color":2}]`} {
		if w := call(t, s.routes(""), "POST", "/api/shared/pixels", body); w.Code != 400 {
			t.Fatal(w.Code)
		}
	}
}
func TestStorageFullRejectsBeforeReadingBodyAndDoesNotConsumeQuota(t *testing.T) {
	s, _ := testStore(t)
	s.voiceCountLimit = 1
	if w := httptest.NewRecorder(); func() int { s.routes("").ServeHTTP(w, voiceRequest(t, "192.0.2.1:1")); return w.Code }() != 201 {
		t.Fatal(w.Code, w.Body)
	}
	req := httptest.NewRequest("POST", "/api/shared/voices", &forbiddenReader{t: t})
	req.RemoteAddr = "192.0.2.2:2"
	w := httptest.NewRecorder()
	s.routes("").ServeHTTP(w, req)
	if w.Code != 507 {
		t.Fatal(w.Code, w.Body)
	}
	var used int
	s.db.QueryRow("SELECT count(*) FROM voice_limits WHERE ip='192.0.2.2'").Scan(&used)
	if used != 0 {
		t.Fatal("quota consumed on full store")
	}
}

type forbiddenReader struct{ t *testing.T }

func (r *forbiddenReader) Read([]byte) (int, error) {
	r.t.Error("rejected upload body was read")
	return 0, context.Canceled
}
func TestDailyLimitRejectsBeforeReadingBody(t *testing.T) {
	s, _ := testStore(t)
	day := s.now().UTC().Format("2006-01-02")
	s.db.Exec("INSERT INTO voice_limits VALUES(?,?,2)", "192.0.2.1", day)
	req := httptest.NewRequest("POST", "/api/shared/voices", &forbiddenReader{t: t})
	req.RemoteAddr = "192.0.2.1:1"
	w := httptest.NewRecorder()
	s.routes("").ServeHTTP(w, req)
	if w.Code != 429 {
		t.Fatal(w.Code)
	}
}
func TestAudioBytesCapacity(t *testing.T) {
	s, _ := testStore(t)
	s.voiceByteLimit = 1
	w := httptest.NewRecorder()
	s.routes("").ServeHTTP(w, voiceRequest(t, "192.0.2.1:1"))
	if w.Code != 507 {
		t.Fatal(w.Code, w.Body)
	}
	var n int
	s.db.QueryRow("SELECT count(*) FROM voices").Scan(&n)
	if n != 0 {
		t.Fatal("over-capacity clip saved")
	}
}
func TestRequestAndPixelFloodAreBounded(t *testing.T) {
	s, _ := testStore(t)
	h := s.routes("")
	limited := false
	for range 100 {
		w := call(t, h, "GET", "/api/shared/voices", "")
		if w.Code == 429 {
			limited = true
			break
		}
		if w.Code != 200 {
			t.Fatal(w.Code)
		}
	}
	if !limited {
		t.Fatal("request flood not limited")
	}
	s.protection = newProtection()
	for range 8 {
		if !s.pixelBudget("192.0.2.1", 512) {
			t.Fatal("normal burst rejected")
		}
	}
	if s.pixelBudget("192.0.2.1", 512) {
		t.Fatal("unlimited pixel flood")
	}
}
func TestUploadAndStreamConcurrencyAreBounded(t *testing.T) {
	for _, path := range []string{"voices", "events"} {
		s, _ := testStore(t)
		entered := make(chan struct{}, 1)
		release := make(chan struct{})
		handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { entered <- struct{}{}; <-release })
		method := http.MethodPost
		capacity := 2
		if path == "events" {
			method = http.MethodGet
			capacity = 4
		}
		for range capacity {
			req := httptest.NewRequest(method, "/api/shared/"+path, nil)
			req.RemoteAddr = "192.0.2.1:1"
			go s.guard(httptest.NewRecorder(), req, handler)
			<-entered
		}
		req := httptest.NewRequest(method, "/api/shared/"+path, nil)
		req.RemoteAddr = "192.0.2.1:1"
		w := httptest.NewRecorder()
		s.guard(w, req, handler)
		if w.Code != 503 && w.Code != 429 {
			t.Fatal(path, w.Code)
		}
		close(release)
	}
}
func TestLimiterMemoryHasACap(t *testing.T) {
	g := newProtection()
	now := time.Now()
	g.mu.Lock()
	defer g.mu.Unlock()
	for range 8192 {
		key := string(rune(len(g.clients) + 1))
		if g.budget(key, now) == nil {
			t.Fatal("early cap")
		}
	}
	if g.budget("new ip", now) != nil {
		t.Fatal("unbounded limiter map")
	}
	if g.budget("new ip", now.Add(6*time.Minute)) == nil {
		t.Fatal("stale entries never expire")
	}
}
func TestAPIHasNonExecutableContentHeaders(t *testing.T) {
	s, _ := testStore(t)
	w := call(t, s.routes(""), "GET", "/api/shared/voices", "")
	if w.Header().Get("X-Content-Type-Options") != "nosniff" || w.Header().Get("Content-Type") != "application/json" || !strings.Contains(w.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Fatal(w.Header())
	}
}

func TestHeadCannotHoldAnEventStream(t *testing.T) {
	s, _ := testStore(t)
	w := call(t, s.routes(""), "HEAD", "/api/shared/events", "")
	if w.Code != 405 {
		t.Fatal(w.Code)
	}
}
func TestDatabaseHasAHardSizeLimit(t *testing.T) {
	s, _ := testStore(t)
	var size, pages int64
	if err := s.db.QueryRow("PRAGMA page_size").Scan(&size); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRow("PRAGMA max_page_count").Scan(&pages); err != nil {
		t.Fatal(err)
	}
	if size*pages != 128<<20 {
		t.Fatal(size, pages)
	}
}
