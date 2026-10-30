package main

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"time"
)

type gameKey struct {
	Game  string `json:"game"`
	Level int    `json:"level"`
}
type gameResult struct {
	Game  string `json:"game"`
	Level int    `json:"level"`
	Value int64  `json:"value"`
}

func validGameResult(input gameResult) bool {
	if !validGameKey(gameKey{input.Game, input.Level}) || input.Value <= 0 {
		return false
	}
	switch input.Game {
	case "gravity":
		// The simulation advances in 15 ms ticks. A sub-second completion is
		// implausible for every shipped track, even with the fastest engine.
		return input.Value >= 1000 && input.Value <= 3600000 && input.Value%15 == 0
	case "flappy":
		return input.Value <= 10000
	case "tetris":
		// Hard drops award distance times level, so any positive integer is valid.
		return input.Value <= 10000000
	}
	return false
}

func validGameKey(key gameKey) bool {
	switch key.Game {
	case "gravity":
		return key.Level >= 0 && key.Level < 30
	case "flappy", "tetris":
		return key.Level == 0
	}
	return false
}
func (s *sharedServer) getBest(w http.ResponseWriter, r *http.Request) {
	level, e1 := strconv.Atoi(r.PathValue("level"))
	key := gameKey{r.PathValue("game"), level}
	if e1 != nil || !validGameKey(key) {
		fail(w, 400, "invalid game or level")
		return
	}
	var value int64
	err := s.db.QueryRowContext(r.Context(), "SELECT value FROM game_bests WHERE game=? AND level=?", key.Game, key.Level).Scan(&value)
	if err == sql.ErrNoRows {
		jsonResponse(w, 200, map[string]any{"value": nil})
		return
	}
	if err != nil {
		fail(w, 500, "storage unavailable")
		return
	}
	jsonResponse(w, 200, map[string]any{"value": value})
}
func (s *sharedServer) submitBest(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 256)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var fields struct {
		Game  *string `json:"game"`
		Level *int    `json:"level"`
		Value *int64  `json:"value"`
	}
	var extra any
	if decoder.Decode(&fields) != nil || decoder.Decode(&extra) != io.EOF || fields.Game == nil || fields.Level == nil || fields.Value == nil {
		fail(w, 400, "invalid game result")
		return
	}
	input := gameResult{*fields.Game, *fields.Level, *fields.Value}
	if !validGameResult(input) {
		fail(w, 400, "result outside game bounds")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		fail(w, 500, "storage unavailable")
		return
	}
	defer tx.Rollback()
	comparison := "game_bests.value<excluded.value"
	if input.Game == "gravity" {
		comparison = "game_bests.value>excluded.value"
	}
	// The SQL fragment is selected exclusively from the two constants above.
	result, err := tx.ExecContext(r.Context(), "INSERT INTO game_bests(game,level,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(game,level) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE "+comparison, input.Game, input.Level, input.Value, s.now().UTC().Format(time.RFC3339))
	if err != nil {
		fail(w, 500, "storage unavailable")
		return
	}
	changed, _ := result.RowsAffected()
	var value int64
	if err = tx.QueryRowContext(r.Context(), "SELECT value FROM game_bests WHERE game=? AND level=?", input.Game, input.Level).Scan(&value); err != nil {
		fail(w, 500, "storage unavailable")
		return
	}
	if tx.Commit() != nil {
		fail(w, 500, "storage unavailable")
		return
	}
	jsonResponse(w, 200, map[string]any{"value": value, "newBest": changed > 0})
}
