// Public shared terminal files: persistent pixels, voice notes and live updates.
package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const boardWidth, boardHeight, paletteSize = 384, 192, 16
const maxVoiceBytes = 2 << 20

type pixel struct {
	X     int `json:"x"`
	Y     int `json:"y"`
	Color int `json:"color"`
}
type board struct {
	Width  int   `json:"width"`
	Height int   `json:"height"`
	Pixels []int `json:"pixels"`
}
type voice struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
	Mime      string `json:"mime"`
}
type event struct {
	Kind string
	Data []byte
}
type sharedServer struct {
	db              *sql.DB
	mu              sync.Mutex
	clients         map[chan event]struct{}
	trustedProxies  []netip.Prefix
	allowedOrigins  map[string]struct{}
	now             func() time.Time
	protection      *apiProtection
	voiceCountLimit int
	voiceByteLimit  int64
}

func openStore(path string) (*sharedServer, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite3", "file:"+filepath.ToSlash(path)+"?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=on")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	var pageSize int
	if err = db.QueryRow("PRAGMA page_size").Scan(&pageSize); err != nil {
		db.Close()
		return nil, err
	}
	if _, err = db.Exec("PRAGMA max_page_count=" + strconv.Itoa((128<<20)/pageSize) + "; PRAGMA journal_size_limit=8388608; PRAGMA wal_autocheckpoint=256;"); err != nil {
		db.Close()
		return nil, err
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS game_bests(game TEXT NOT NULL CHECK(game IN ('gravity','flappy','tetris')),level INTEGER NOT NULL CHECK(level>=0 AND level<30),value INTEGER NOT NULL CHECK(value>0),updated_at TEXT NOT NULL,PRIMARY KEY(game,level));
 CREATE TABLE IF NOT EXISTS pixels (position INTEGER PRIMARY KEY, color INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS canvas_meta (id INTEGER PRIMARY KEY CHECK(id=1), width INTEGER NOT NULL, height INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS voice_limits (ip TEXT NOT NULL, day TEXT NOT NULL, sent INTEGER NOT NULL CHECK(sent BETWEEN 1 AND 2), PRIMARY KEY(ip,day));
 CREATE TABLE IF NOT EXISTS voices (id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, mime TEXT NOT NULL, audio BLOB NOT NULL);`)
	if err != nil {
		db.Close()
		return nil, err
	}
	if err = migrateCanvas(db); err != nil {
		db.Close()
		return nil, err
	}
	proxies, _ := parseProxies("127.0.0.1/32,::1/128")
	return &sharedServer{db: db, clients: make(map[chan event]struct{}), trustedProxies: proxies, now: time.Now, protection: newProtection(), voiceCountLimit: maxStoredVoices, voiceByteLimit: maxStoredAudioBytes}, nil
}

func parseCORSOrigins(value string) (map[string]struct{}, error) {
	origins := make(map[string]struct{})
	for _, domain := range strings.Split(value, ",") {
		domain = strings.ToLower(strings.TrimSpace(domain))
		if domain == "" {
			if strings.TrimSpace(value) == "" {
				return origins, nil
			}
			return nil, errors.New("SERVER_CORS contains an empty domain")
		}
		if len(domain) > 253 || strings.ContainsAny(domain, ":/@?#\\% ") {
			return nil, fmt.Errorf("invalid SERVER_CORS domain %q", domain)
		}
		for _, label := range strings.Split(domain, ".") {
			if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
				return nil, fmt.Errorf("invalid SERVER_CORS domain %q", domain)
			}
			for _, ch := range label {
				if !(ch >= 'a' && ch <= 'z' || ch >= '0' && ch <= '9' || ch == '-') {
					return nil, fmt.Errorf("invalid SERVER_CORS domain %q", domain)
				}
			}
		}
		origins[domain] = struct{}{}
	}
	return origins, nil
}

func (s *sharedServer) allowOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Opaque != "" || parsed.User != nil || parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}
	_, ok := s.allowedOrigins[strings.ToLower(parsed.Hostname())]
	return ok
}

// Upgrade the old grid once, then extend its right edge without stretching existing art.
func migrateCanvas(db *sql.DB) error {
	var width, height int
	err := db.QueryRow("SELECT width,height FROM canvas_meta WHERE id=1").Scan(&width, &height)
	if err == nil && width == boardWidth && height == boardHeight {
		return nil
	}
	factor := 1
	if errors.Is(err, sql.ErrNoRows) {
		width, height, factor = 64, 48, 4
	} else if err != nil {
		return err
	} else if width != 256 || height != 192 {
		return fmt.Errorf("unsupported stored canvas size %dx%d", width, height)
	}
	rows, err := db.Query("SELECT position,color FROM pixels")
	if err != nil {
		return err
	}
	type saved struct{ position, color int }
	var old []saved
	for rows.Next() {
		var p saved
		if err = rows.Scan(&p.position, &p.color); err != nil {
			rows.Close()
			return err
		}
		old = append(old, p)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec("DELETE FROM pixels"); err != nil {
		return err
	}
	stmt, err := tx.Prepare("INSERT INTO pixels(position,color) VALUES(?,?)")
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, p := range old {
		if p.color == 0 || p.position < 0 || p.position >= width*height {
			continue
		}
		for y := 0; y < factor; y++ {
			for x := 0; x < factor; x++ {
				position := (p.position/width*factor+y)*boardWidth + p.position%width*factor + x
				if _, err = stmt.Exec(position, p.color); err != nil {
					return err
				}
			}
		}
	}
	if _, err = tx.Exec("INSERT INTO canvas_meta(id,width,height) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET width=excluded.width,height=excluded.height", boardWidth, boardHeight); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *sharedServer) snapshot() (board, error) {
	b := board{boardWidth, boardHeight, make([]int, boardWidth*boardHeight)}
	rows, err := s.db.Query("SELECT position,color FROM pixels")
	if err != nil {
		return b, err
	}
	defer rows.Close()
	for rows.Next() {
		var p, c int
		if err = rows.Scan(&p, &c); err != nil {
			return b, err
		}
		if p >= 0 && p < len(b.Pixels) {
			b.Pixels[p] = c
		}
	}
	return b, rows.Err()
}
func (s *sharedServer) voices() ([]voice, error) {
	result := make([]voice, 0)
	rows, err := s.db.Query("SELECT id,name,created_at,mime FROM voices ORDER BY id DESC LIMIT 100")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var v voice
		if err = rows.Scan(&v.ID, &v.Name, &v.CreatedAt, &v.Mime); err != nil {
			return nil, err
		}
		result = append(result, v)
	}
	return result, rows.Err()
}
func jsonResponse(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func fail(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]string{"error": message})
}

// Caller holds mu: writes and broadcasts have one ordering, including initial SSE snapshots.
func (s *sharedServer) broadcast(kind string, data any) {
	raw, _ := json.Marshal(data)
	e := event{kind, raw}
	for ch := range s.clients {
		select {
		case ch <- e:
		default:
			close(ch)
			delete(s.clients, ch)
		}
	}
}
func (s *sharedServer) routes(staticDir string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/games/best/{game}/{level}", s.getBest)
	mux.HandleFunc("POST /api/games/best", s.submitBest)
	mux.HandleFunc("GET /api/shared/canvas", func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		b, err := s.snapshot()
		s.mu.Unlock()
		if err != nil {
			fail(w, 500, "storage unavailable")
			return
		}
		jsonResponse(w, 200, b)
	})
	mux.HandleFunc("POST /api/shared/pixels", s.writePixels)
	mux.HandleFunc("GET /api/shared/events", s.events)
	mux.HandleFunc("GET /api/shared/voices", func(w http.ResponseWriter, r *http.Request) {
		v, err := s.voices()
		if err != nil {
			fail(w, 500, "storage unavailable")
			return
		}
		jsonResponse(w, 200, v)
	})
	mux.HandleFunc("POST /api/shared/voices", s.uploadVoice)
	mux.HandleFunc("GET /api/shared/voices/{id}", s.audio)
	if staticDir != "" {
		mux.Handle("/", http.FileServer(http.Dir(staticDir)))
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Add("Vary", "Origin")
			origin := r.Header.Get("Origin")
			if origin != "" && s.allowOrigin(origin) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			}
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
			w.Header().Set("Referrer-Policy", "no-referrer")
			if r.Method == "OPTIONS" {
				w.WriteHeader(204)
				return
			}
			s.guard(w, r, mux)
			return
		}
		mux.ServeHTTP(w, r)
	})
}
func (s *sharedServer) writePixels(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
	var updates []pixel
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(&updates) != nil || len(updates) == 0 || len(updates) > 512 {
		fail(w, 400, "expected 1–512 pixels")
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		fail(w, 400, "invalid JSON")
		return
	}
	for _, p := range updates {
		if p.X < 0 || p.X >= boardWidth || p.Y < 0 || p.Y >= boardHeight || p.Color < 0 || p.Color >= paletteSize {
			fail(w, 400, "pixel outside board or palette")
			return
		}
	}
	if !s.pixelBudget(s.clientIP(r), len(updates)) {
		throttle(w)
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
	stmt, err := tx.Prepare("INSERT INTO pixels(position,color) VALUES(?,?) ON CONFLICT(position) DO UPDATE SET color=excluded.color WHERE color<>excluded.color")
	if err != nil {
		fail(w, 500, "storage unavailable")
		return
	}
	defer stmt.Close()
	for _, p := range updates {
		if _, err = stmt.Exec(p.Y*boardWidth+p.X, p.Color); err != nil {
			fail(w, 500, "storage unavailable")
			return
		}
	}
	if tx.Commit() != nil {
		fail(w, 500, "storage unavailable")
		return
	}
	s.broadcast("pixels", updates)
	w.WriteHeader(204)
}
func (s *sharedServer) events(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		w.Header().Set("Allow", "GET")
		w.WriteHeader(405)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		fail(w, 500, "stream unavailable")
		return
	}
	s.mu.Lock()
	b, err := s.snapshot()
	if err != nil {
		s.mu.Unlock()
		fail(w, 500, "storage unavailable")
		return
	}
	ch := make(chan event, 64)
	s.clients[ch] = struct{}{}
	s.mu.Unlock()
	defer func() { s.mu.Lock(); delete(s.clients, ch); s.mu.Unlock() }()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Connection", "keep-alive")
	send := func(kind string, data []byte) error {
		_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(10 * time.Second))
		_, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", kind, data)
		flusher.Flush()
		_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})
		return err
	}
	raw, _ := json.Marshal(b)
	if send("canvas", raw) != nil {
		return
	}
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case e, ok := <-ch:
			if !ok || send(e.Kind, e.Data) != nil {
				return
			}
		case <-ticker.C:
			if send("heartbeat", []byte("{}")) != nil {
				return
			}
		}
	}
}
func (s *sharedServer) uploadVoice(w http.ResponseWriter, r *http.Request) {
	ip := s.clientIP(r)
	now := s.now().UTC()
	if err := checkVoiceRoom(r.Context(), s.db, ip, now.Format("2006-01-02"), 0, s.voiceCountLimit, s.voiceByteLimit); err != nil {
		s.voiceError(w, now, err)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxVoiceBytes+16<<10)
	if err := r.ParseMultipartForm(maxVoiceBytes + 16<<10); err != nil {
		fail(w, 413, "clip too large (2 MiB maximum)")
		return
	}
	defer r.MultipartForm.RemoveAll()
	name := strings.TrimSpace(r.FormValue("name"))
	if !validVoiceName(name) {
		fail(w, 400, "name must have 1–40 characters, without control characters")
		return
	}
	file, header, err := r.FormFile("audio")
	if err != nil {
		fail(w, 400, "audio required")
		return
	}
	defer file.Close()
	mime := strings.ToLower(strings.TrimSpace(strings.Split(header.Header.Get("Content-Type"), ";")[0]))
	if mime != "audio/wav" && mime != "audio/x-wav" {
		fail(w, 415, errVoiceFormat.Error())
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxVoiceBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxVoiceBytes {
		fail(w, 413, "empty or oversized clip")
		return
	}
	pcm, err := voicePCM(data)
	if err != nil {
		fail(w, 415, err.Error())
		return
	}
	data, err = compressVoice(pcm)
	if err != nil {
		fail(w, 500, "audio encoding unavailable")
		return
	}
	mime = "audio/flac"
	s.mu.Lock()
	defer s.mu.Unlock()
	now = s.now().UTC()
	day := now.Format("2006-01-02")
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		fail(w, 500, "storage unavailable")
		return
	}
	defer tx.Rollback()
	if err = checkVoiceRoom(r.Context(), tx, ip, day, int64(len(data)), s.voiceCountLimit, s.voiceByteLimit); err != nil {
		s.voiceError(w, now, err)
		return
	}
	if _, err = tx.ExecContext(r.Context(), "DELETE FROM voice_limits WHERE day<?", day); err != nil {
		fail(w, 500, "storage unavailable")
		return
	}
	quota, err := tx.ExecContext(r.Context(), "INSERT INTO voice_limits(ip,day,sent) VALUES(?,?,1) ON CONFLICT(ip,day) DO UPDATE SET sent=sent+1 WHERE sent<?", ip, day, voicesPerDay)
	if err != nil {
		fail(w, 500, "storage unavailable")
		return
	}
	changed, _ := quota.RowsAffected()
	if changed == 0 {
		limitResponse(w, now)
		return
	}
	v := voice{Name: name, CreatedAt: now.Format(time.RFC3339), Mime: mime}
	result, err := tx.ExecContext(r.Context(), "INSERT INTO voices(name,created_at,mime,audio) VALUES(?,?,?,?)", v.Name, v.CreatedAt, v.Mime, data)
	if err != nil {
		fail(w, 500, "storage unavailable")
		return
	}
	v.ID, _ = result.LastInsertId()
	if tx.Commit() != nil {
		fail(w, 500, "storage unavailable")
		return
	}
	s.broadcast("voices", v)
	jsonResponse(w, 201, v)
}
func (s *sharedServer) audio(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id < 1 {
		http.NotFound(w, r)
		return
	}
	var mime, created string
	var data []byte
	err = s.db.QueryRowContext(r.Context(), "SELECT mime,created_at,audio FROM voices WHERE id=?", id).Scan(&mime, &created, &data)
	if errors.Is(err, sql.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		fail(w, 500, "storage unavailable")
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Content-Disposition", "inline")
	stamp, _ := time.Parse(time.RFC3339, created)
	http.ServeContent(w, r, "voice", stamp, bytes.NewReader(data))
}
func main() {
	addr := flag.String("addr", "127.0.0.1:8081", "HTTP listen address")
	path := flag.String("db", "data/shared.sqlite", "SQLite database")
	static := flag.String("static", "", "optional built frontend directory, e.g. dist")
	proxyList := flag.String("trusted-proxies", "127.0.0.1/32,::1/128", "comma-separated proxy CIDRs allowed to forward client IPs")
	flag.Parse()
	corsOrigins, err := parseCORSOrigins(os.Getenv("SERVER_CORS"))
	if err != nil {
		log.Fatal(err)
	}
	proxies, err := parseProxies(*proxyList)
	if err != nil {
		log.Fatal(err)
	}
	store, err := openStore(*path)
	if err != nil {
		log.Fatal(err)
	}
	defer store.db.Close()
	store.trustedProxies = proxies
	store.allowedOrigins = corsOrigins
	srv := &http.Server{Addr: *addr, Handler: store.routes(*static), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 8 << 10}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		timeout, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(timeout)
	}()
	log.Printf("Shared files: http://%s (SQLite: %s)", *addr, *path)
	if err = srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
