package main

import (
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"time"
)

const voicesPerDay = 2

func parseProxies(value string) ([]netip.Prefix, error) {
	var result []netip.Prefix
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		prefix, err := netip.ParsePrefix(part)
		if err != nil {
			return nil, err
		}
		result = append(result, prefix)
	}
	return result, nil
}
func (s *sharedServer) trusted(ip netip.Addr) bool {
	for _, prefix := range s.trustedProxies {
		if prefix.Contains(ip) {
			return true
		}
	}
	return false
}
func (s *sharedServer) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil {
		return "unknown"
	}
	peer = peer.Unmap()
	if !s.trusted(peer) {
		return peer.String()
	}
	// Walk from our trusted proxy towards the client. Never trust a client-supplied
	// leftmost X-Forwarded-For value across an untrusted hop.
	chain := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(chain) - 1; i >= 0; i-- {
		if !s.trusted(peer) {
			break
		}
		next, err := netip.ParseAddr(strings.TrimSpace(chain[i]))
		if err != nil {
			return peer.String()
		}
		peer = next.Unmap()
	}
	return peer.String()
}
func limitResponse(w http.ResponseWriter, now time.Time) {
	next := now.UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)
	w.Header().Set("Retry-After", strconv.Itoa(max(1, int(next.Sub(now).Seconds()))))
	jsonResponse(w, 429, map[string]string{"error": "DAILY VOICE LIMIT / 2 MESSAGES PER DAY", "code": "DAILY_VOICE_LIMIT"})
}
