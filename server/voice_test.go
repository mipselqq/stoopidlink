package main

import (
	"bytes"
	"crypto/md5"
	"encoding/binary"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/mewkiz/flac"
)

func testWave(samples []int16) []byte {
	data := make([]byte, 44+len(samples)*2)
	copy(data, "RIFF")
	binary.LittleEndian.PutUint32(data[4:], uint32(len(data)-8))
	copy(data[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(data[16:], 16)
	binary.LittleEndian.PutUint16(data[20:], 1)
	binary.LittleEndian.PutUint16(data[22:], 1)
	binary.LittleEndian.PutUint32(data[24:], voiceSampleRate)
	binary.LittleEndian.PutUint32(data[28:], voiceSampleRate*2)
	binary.LittleEndian.PutUint16(data[32:], 2)
	binary.LittleEndian.PutUint16(data[34:], 16)
	copy(data[36:], "data")
	binary.LittleEndian.PutUint32(data[40:], uint32(len(samples)*2))
	for i, s := range samples {
		binary.LittleEndian.PutUint16(data[44+i*2:], uint16(s))
	}
	return data
}
func TestFLACIsLosslessAndKeepsFormat(t *testing.T) {
	for _, n := range []int{16, 4096, 4097, 4100, 8193, voiceSampleRate * 30} {
		samples := make([]int16, n)
		for i := range samples {
			samples[i] = int16(i%128*400 - 25600)
		}
		wav := testWave(samples)
		pcm, err := voicePCM(wav)
		if err != nil {
			t.Fatal(err)
		}
		encoded, err := compressVoice(pcm)
		if err != nil {
			t.Fatal(err)
		}
		stream, err := flac.New(bytes.NewReader(encoded))
		if err != nil {
			t.Fatal(err)
		}
		if stream.Info.SampleRate != 11025 || stream.Info.NChannels != 1 || stream.Info.BitsPerSample != 16 || stream.Info.NSamples != uint64(n) || stream.Info.MD5sum != md5.Sum(pcm) {
			t.Fatal("FLAC format or checksum mismatch")
		}
		var actual []int16
		for {
			f, err := stream.ParseNext()
			if err == io.EOF {
				break
			}
			if err != nil {
				t.Fatal(n, err)
			}
			for _, v := range f.Subframes[0].Samples {
				actual = append(actual, int16(v))
			}
		}
		if !slices.Equal(actual, samples) {
			t.Fatal(n, "FLAC changed the samples")
		}
		if n > 4000 && len(encoded) >= len(wav) {
			t.Fatal("test voice was not compressed")
		}
	}
}
func TestWAVRejectsWrongFormatAndDuration(t *testing.T) {
	for _, change := range []func([]byte){func(b []byte) { binary.LittleEndian.PutUint32(b[24:], 48000) }, func(b []byte) { binary.LittleEndian.PutUint16(b[22:], 2) }, func(b []byte) { binary.LittleEndian.PutUint16(b[34:], 8) }, func(b []byte) { binary.LittleEndian.PutUint32(b[40:], 999999) }, func(b []byte) { binary.LittleEndian.PutUint16(b[20:], 3) }} {
		b := testWave(make([]int16, 11025))
		change(b)
		if _, err := voicePCM(b); err == nil {
			t.Fatal("invalid WAV accepted")
		}
	}
	if _, err := voicePCM(testWave(make([]int16, voiceSampleRate*30+1))); err == nil {
		t.Fatal("duration limit bypassed")
	}
}
func voiceRequest(t *testing.T, ip string) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	writer.WriteField("name", "Test clip")
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", `form-data; name="audio"; filename="voice.wav"`)
	header.Set("Content-Type", "audio/wav")
	part, _ := writer.CreatePart(header)
	part.Write(testWave(make([]int16, 64)))
	writer.Close()
	req := httptest.NewRequest("POST", "/api/shared/voices", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.RemoteAddr = ip
	return req
}
func TestVoiceDailyLimitPersistsAndResets(t *testing.T) {
	s, path := testStore(t)
	now := time.Date(2026, 10, 29, 23, 59, 50, 0, time.UTC)
	s.now = func() time.Time { return now }
	send := func(ip string) int {
		t.Helper()
		w := httptest.NewRecorder()
		s.routes("").ServeHTTP(w, voiceRequest(t, ip))
		if w.Code == 429 && w.Header().Get("Retry-After") == "" {
			t.Fatal("missing retry time")
		}
		return w.Code
	}
	if send("198.51.100.1:1234") != 201 || send("198.51.100.1:1235") != 201 || send("198.51.100.1:1236") != 429 {
		t.Fatal("daily limit failed")
	}
	if send("198.51.100.2:1234") != 201 {
		t.Fatal("different IP blocked")
	}
	s.db.Close()
	reopened, err := openStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.db.Close()
	s = reopened
	s.now = func() time.Time { return now }
	if send("198.51.100.1:9999") != 429 {
		t.Fatal("restart reset the limit")
	}
	now = now.Add(20 * time.Second)
	if send("198.51.100.1:1234") != 201 {
		t.Fatal("new day did not reset the limit")
	}
}
func TestParallelVoiceUploadsCannotExceedQuota(t *testing.T) {
	s, _ := testStore(t)
	h := s.routes("")
	var wg sync.WaitGroup
	codes := make(chan int, 8)
	for range 8 {
		req := voiceRequest(t, "203.0.113.10:1234")
		wg.Add(1)
		go func() { defer wg.Done(); w := httptest.NewRecorder(); h.ServeHTTP(w, req); codes <- w.Code }()
	}
	wg.Wait()
	close(codes)
	saved, limited := 0, 0
	for code := range codes {
		switch code {
		case 201:
			saved++
		case 429, 503:
			limited++
		default:
			t.Fatal(code)
		}
	}
	if saved != 2 || limited != 6 {
		t.Fatal(saved, limited)
	}
}
func TestClientIPOnlyTrustsConfiguredProxyHops(t *testing.T) {
	s, _ := testStore(t)
	for _, test := range []struct{ remote, forwarded, want string }{
		{"198.51.100.1:1234", "203.0.113.5", "198.51.100.1"},
		{"127.0.0.1:1234", "203.0.113.5", "203.0.113.5"},
		{"127.0.0.1:1234", "1.2.3.4, 198.51.100.1", "198.51.100.1"},
		{"[::1]:1234", "::ffff:192.0.2.1", "192.0.2.1"},
		{"127.0.0.1:1234", "not an IP", "127.0.0.1"},
	} {
		r := httptest.NewRequest("POST", "/", nil)
		r.RemoteAddr = test.remote
		r.Header.Set("X-Forwarded-For", test.forwarded)
		if got := s.clientIP(r); got != test.want {
			t.Fatal(got, test.want)
		}
	}
}
func TestFailedVoiceDoesNotConsumeQuota(t *testing.T) {
	s, _ := testStore(t)
	r := httptest.NewRequest("POST", "/api/shared/voices", bytes.NewBufferString("bad multipart"))
	r.RemoteAddr = "198.51.100.1:1234"
	w := httptest.NewRecorder()
	s.routes("").ServeHTTP(w, r)
	var count int
	if err := s.db.QueryRow("SELECT count(*) FROM voice_limits").Scan(&count); err != nil || count != 0 {
		t.Fatal("invalid recording consumed quota", err, count)
	}
}
