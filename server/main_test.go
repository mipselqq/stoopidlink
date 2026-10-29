package main

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testStore(t *testing.T) (*sharedServer, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "shared.sqlite")
	s, err := openStore(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.db.Close() })
	return s, path
}
func call(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(method, path, strings.NewReader(body)))
	return w
}
func TestPixelsValidationAndPersistence(t *testing.T) {
	s, path := testStore(t)
	h := s.routes("")
	for _, body := range []string{`[]`, `[{"x":384,"y":0,"color":1}]`, `[{"x":0,"y":-1,"color":1}]`, `[{"x":0,"y":0,"color":16}]`, `[{"x":0,"y":0,"color":1}] {}`, `[{"x":0,"y":0,"color":1,"bad":1}]`} {
		if w := call(t, h, "POST", "/api/shared/pixels", body); w.Code != 400 {
			t.Fatalf("invalid pixels accepted: %s (%d)", body, w.Code)
		}
	}
	if w := call(t, h, "POST", "/api/shared/pixels", `[{"x":383,"y":191,"color":7},{"x":0,"y":0,"color":2}]`); w.Code != 204 {
		t.Fatal(w.Code, w.Body)
	}
	s.db.Close()
	reopened, err := openStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.db.Close()
	w := call(t, reopened.routes(""), "GET", "/api/shared/canvas", "")
	var b board
	if err = json.Unmarshal(w.Body.Bytes(), &b); err != nil {
		t.Fatal(err)
	}
	if b.Width != boardWidth || b.Height != boardHeight || len(b.Pixels) != boardWidth*boardHeight || b.Pixels[0] != 2 || b.Pixels[len(b.Pixels)-1] != 7 {
		t.Fatal("pixels did not survive reopen")
	}
}
func TestLiveClientsReceiveSameUpdates(t *testing.T) {
	s, _ := testStore(t)
	server := httptest.NewServer(s.routes(""))
	defer server.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	client := func() *bufio.Reader {
		t.Helper()
		req, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/api/shared/events", nil)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { res.Body.Close() })
		reader := bufio.NewReader(res.Body)
		if line, _ := reader.ReadString('\n'); line != "event: canvas\n" {
			t.Fatal(line)
		}
		reader.ReadString('\n')
		reader.ReadString('\n')
		return reader
	}
	a, b := client(), client()
	response, err := http.Post(server.URL+"/api/shared/pixels", "application/json", strings.NewReader(`[{"x":12,"y":13,"color":4}]`))
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	for _, reader := range []*bufio.Reader{a, b} {
		done := make(chan string, 1)
		go func(r *bufio.Reader) {
			line, _ := r.ReadString('\n')
			data, _ := r.ReadString('\n')
			done <- line + data
		}(reader)
		select {
		case got := <-done:
			if got != "event: pixels\ndata: [{\"x\":12,\"y\":13,\"color\":4}]\n" {
				t.Fatal(got)
			}
		case <-time.After(2 * time.Second):
			t.Fatal("no live update")
		}
	}
	cancel()
}
func TestVoiceUploadPersistenceAndRange(t *testing.T) {
	s, path := testStore(t)
	data := testWave(make([]int16, 11025))
	upload := func(name, mime string, audio []byte) *httptest.ResponseRecorder {
		t.Helper()
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		_ = writer.WriteField("name", name)
		headers := make(textproto.MIMEHeader)
		headers.Set("Content-Disposition", `form-data; name="audio"; filename="voice"`)
		headers.Set("Content-Type", mime)
		part, _ := writer.CreatePart(headers)
		part.Write(audio)
		writer.Close()
		req := httptest.NewRequest("POST", "/api/shared/voices", &body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()
		s.routes("").ServeHTTP(w, req)
		return w
	}
	for _, test := range []struct {
		name, mime string
		data       []byte
		status     int
	}{{"", "audio/wav", data, 400}, {"clip", "text/html", data, 415}, {"clip", "audio/wav", []byte("<script>"), 415}, {"clip", "audio/wav", bytes.Repeat([]byte("x"), maxVoiceBytes+1), 413}} {
		if w := upload(test.name, test.mime, test.data); w.Code != test.status {
			t.Fatalf("%s: %d != %d", test.name, w.Code, test.status)
		}
	}
	w := upload("<b>hello</b>", "audio/wav", data)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body)
	}
	var saved voice
	json.Unmarshal(w.Body.Bytes(), &saved)
	s.db.Close()
	reopened, err := openStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.db.Close()
	h := reopened.routes("")
	w = call(t, h, "GET", "/api/shared/voices", "")
	var voices []voice
	json.Unmarshal(w.Body.Bytes(), &voices)
	if len(voices) != 1 || voices[0].Name != "<b>hello</b>" {
		t.Fatal(w.Body)
	}
	req := httptest.NewRequest("GET", fmt.Sprintf("/api/shared/voices/%d", saved.ID), nil)
	req.Header.Set("Range", "bytes=0-3")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != 206 || w.Body.String() != "fLaC" || w.Header().Get("Content-Type") != "audio/flac" {
		t.Fatal(w.Code, w.Body, w.Header())
	}
	if w = call(t, h, "GET", "/api/shared/voices/999", ""); w.Code != 404 {
		t.Fatal(w.Code)
	}
}
func TestUnavailableDatabaseAndCORS(t *testing.T) {
	s, _ := testStore(t)
	s.allowedOrigins, _ = parseCORSOrigins("mipselqq.uk, example.com")
	s.db.Close()
	h := s.routes("")
	for _, path := range []string{"canvas", "voices", "events"} {
		w := call(t, h, "GET", "/api/shared/"+path, "")
		if w.Code != 500 {
			t.Fatal(path, w.Code)
		}
	}
	preflight := httptest.NewRequest("OPTIONS", "/api/shared/voices", nil)
	preflight.Header.Set("Origin", "https://mipselqq.uk")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, preflight)
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "https://mipselqq.uk" {
		t.Fatal(w.Code, w.Header())
	}
}
func TestSlowSubscriberDisconnects(t *testing.T) {
	s, _ := testStore(t)
	ch := make(chan event, 1)
	s.clients[ch] = struct{}{}
	s.mu.Lock()
	s.broadcast("pixels", []pixel{{1, 1, 2}})
	s.broadcast("pixels", []pixel{{1, 1, 3}})
	s.mu.Unlock()
	if len(s.clients) != 0 {
		t.Fatal("slow client retained")
	}
	<-ch
	if _, ok := <-ch; ok {
		t.Fatal("slow client not closed")
	}
}

func TestLegacyCanvasKeepsDrawing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.sqlite")
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec("CREATE TABLE pixels(position INTEGER PRIMARY KEY,color INTEGER NOT NULL); INSERT INTO pixels VALUES(?,?)", 47*64+63, 6)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	s, err := openStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.db.Close()
	b, err := s.snapshot()
	if err != nil {
		t.Fatal(err)
	}
	colored := 0
	for _, color := range b.Pixels {
		if color == 6 {
			colored++
		}
	}
	if colored != 16 || b.Pixels[191*boardWidth+255] != 6 {
		t.Fatal("legacy drawing was lost or shifted")
	}
}

func TestWiderCanvasKeepsPixelCoordinates(t *testing.T) {
	path := filepath.Join(t.TempDir(), "narrow.sqlite")
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec("CREATE TABLE pixels(position INTEGER PRIMARY KEY,color INTEGER NOT NULL); CREATE TABLE canvas_meta(id INTEGER PRIMARY KEY,width INTEGER,height INTEGER); INSERT INTO canvas_meta VALUES(1,256,192); INSERT INTO pixels VALUES(?,?)", 100*256+200, 3)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	s, err := openStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.db.Close()
	b, err := s.snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if b.Pixels[100*boardWidth+200] != 3 || b.Pixels[100*boardWidth+300] != 0 {
		t.Fatal("widening stretched or lost the drawing")
	}
}
