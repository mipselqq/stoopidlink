package main

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

const maxVoiceName = 40
const maxStoredVoices = 1000
const maxStoredAudioBytes int64 = 64 << 20

var errStoreFull = errors.New("shared audio storage is full")
var errDailyLimit = errors.New("daily voice limit reached")

func validVoiceName(name string) bool {
	if len(name) == 0 || len(name) > maxVoiceName*4 || !utf8.ValidString(name) || utf8.RuneCountInString(name) > maxVoiceName {
		return false
	}
	for _, r := range name {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
			return false
		}
	}
	return true
}

// Shared by preflight and the final transaction: the latter is authoritative.
func checkVoiceRoom(ctx context.Context, q interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, ip, day string, additional int64, countLimit int, byteLimit int64) error {
	var used, count int
	var total int64
	if err := q.QueryRowContext(ctx, "SELECT COALESCE((SELECT sent FROM voice_limits WHERE ip=? AND day=?),0)", ip, day).Scan(&used); err != nil {
		return err
	}
	if used >= voicesPerDay {
		return errDailyLimit
	}
	if err := q.QueryRowContext(ctx, "SELECT count(*),COALESCE(sum(length(audio)),0) FROM voices").Scan(&count, &total); err != nil {
		return err
	}
	if count >= countLimit || total >= byteLimit || total+additional > byteLimit {
		return errStoreFull
	}
	return nil
}

type bucket struct {
	tokens float64
	last   time.Time
}

func (b *bucket) take(now time.Time, rate, burst, cost float64) bool {
	if b.last.IsZero() {
		b.tokens = burst
	} else {
		b.tokens = min(burst, b.tokens+max(0, now.Sub(b.last).Seconds())*rate)
	}
	b.last = now
	if b.tokens < cost {
		return false
	}
	b.tokens -= cost
	return true
}

type clientBudget struct {
	requests, writes, pixels, uploads, streams, scores bucket
	lastSeen                                           time.Time
	activeStreams                                      int
	activeRequests                                     int
	activeUploads                                      int
}
type apiProtection struct {
	mu                                       sync.Mutex
	clients                                  map[string]*clientBudget
	global, writeRate, pixelRate, streamRate bucket
	lastSweep                                time.Time
	now                                      func() time.Time
	requests, uploads, streams               chan struct{}
}

func newProtection() *apiProtection {
	return &apiProtection{clients: make(map[string]*clientBudget), now: time.Now, requests: make(chan struct{}, 32), uploads: make(chan struct{}, 4), streams: make(chan struct{}, 64)}
}
func (g *apiProtection) budget(ip string, now time.Time) *clientBudget {
	if client := g.clients[ip]; client != nil {
		client.lastSeen = now
		return client
	}
	if len(g.clients) >= 8192 && now.Sub(g.lastSweep) > time.Minute {
		g.lastSweep = now
		for key, client := range g.clients {
			if client.activeStreams == 0 && client.activeRequests == 0 && now.Sub(client.lastSeen) > 5*time.Minute {
				delete(g.clients, key)
			}
		}
	}
	if len(g.clients) >= 8192 {
		return nil
	}
	client := &clientBudget{lastSeen: now}
	g.clients[ip] = client
	return client
}
func busy(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "2")
	fail(w, 503, "SERVER BUSY / TRY AGAIN")
}
func throttle(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "1")
	jsonResponse(w, 429, map[string]string{"error": "TOO MANY REQUESTS / TRY AGAIN", "code": "REQUEST_RATE_LIMIT"})
}
func (s *sharedServer) guard(w http.ResponseWriter, r *http.Request, next http.Handler) {
	g := s.protection
	ip := s.clientIP(r)
	isStream := r.Method == "GET" && r.URL.Path == "/api/shared/events"
	isUpload := r.Method == "POST" && r.URL.Path == "/api/shared/voices"
	isWrite := r.Method == "POST" && r.URL.Path == "/api/shared/pixels"
	g.mu.Lock()
	now := g.now()
	client := g.budget(ip, now)
	if client == nil {
		g.mu.Unlock()
		busy(w)
		return
	}
	allowed := client.requests.take(now, 40, 80, 1) && g.global.take(now, 200, 400, 1)
	if allowed && isWrite {
		allowed = client.writes.take(now, 25, 40, 1) && g.writeRate.take(now, 100, 150, 1)
	}
	if allowed && isUpload {
		allowed = client.uploads.take(now, 1.0/3, 6, 1)
	}
	if allowed && r.Method == "POST" && r.URL.Path == "/api/games/best" {
		allowed = client.scores.take(now, 0.2, 4, 1)
	}
	if allowed && isStream {
		allowed = client.streams.take(now, 1, 4, 1) && g.streamRate.take(now, 4, 12, 1)
	}
	if !allowed {
		g.mu.Unlock()
		throttle(w)
		return
	}
	if isStream && client.activeStreams >= 4 {
		g.mu.Unlock()
		busy(w)
		return
	}
	if isStream {
		select {
		case g.streams <- struct{}{}:
			client.activeStreams++
		default:
			g.mu.Unlock()
			busy(w)
			return
		}
		g.mu.Unlock()
		defer func() { <-g.streams; g.mu.Lock(); client.activeStreams--; g.mu.Unlock() }()
	} else {
		if client.activeRequests >= 8 || (isUpload && client.activeUploads >= 2) {
			g.mu.Unlock()
			busy(w)
			return
		}
		select {
		case g.requests <- struct{}{}:
			client.activeRequests++
		default:
			g.mu.Unlock()
			busy(w)
			return
		}
		if isUpload {
			select {
			case g.uploads <- struct{}{}:
				client.activeUploads++
			default:
				client.activeRequests--
				<-g.requests
				g.mu.Unlock()
				busy(w)
				return
			}
		}
		g.mu.Unlock()
		controller := http.NewResponseController(w)
		_ = controller.SetWriteDeadline(time.Now().Add(15 * time.Second))
		defer func() {
			_ = controller.SetWriteDeadline(time.Time{})
			<-g.requests
			g.mu.Lock()
			client.activeRequests--
			if isUpload {
				client.activeUploads--
				<-g.uploads
			}
			g.mu.Unlock()
		}()
	}
	next.ServeHTTP(w, r)
}
func (s *sharedServer) pixelBudget(ip string, cost int) bool {
	g := s.protection
	g.mu.Lock()
	defer g.mu.Unlock()
	now := g.now()
	client := g.budget(ip, now)
	return client != nil && client.pixels.take(now, 2048, 4096, float64(cost)) && g.pixelRate.take(now, 8192, 16384, float64(cost))
}

func (s *sharedServer) voiceError(w http.ResponseWriter, now time.Time, err error) {
	switch {
	case errors.Is(err, errDailyLimit):
		limitResponse(w, now)
	case errors.Is(err, errStoreFull):
		jsonResponse(w, 507, map[string]string{"error": "SHARED AUDIO STORAGE FULL", "code": "STORAGE_FULL"})
	default:
		fail(w, 500, "storage unavailable")
	}
}
