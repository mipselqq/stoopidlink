package main

import (
	"bytes"
	"crypto/md5"
	"encoding/binary"
	"errors"

	"github.com/mewkiz/flac"
	"github.com/mewkiz/flac/frame"
	"github.com/mewkiz/flac/meta"
)

const voiceSampleRate = 11025

var errVoiceFormat = errors.New("expected mono WAV PCM, 11025 Hz, 16 bit, at most 30 seconds")

func voicePCM(wav []byte) ([]byte, error) {
	if len(wav) < 44 || string(wav[:4]) != "RIFF" || string(wav[8:12]) != "WAVE" || uint64(binary.LittleEndian.Uint32(wav[4:8]))+8 != uint64(len(wav)) {
		return nil, errVoiceFormat
	}
	var pcm []byte
	format := false
	for offset := 12; offset < len(wav); {
		if len(wav)-offset < 8 {
			return nil, errVoiceFormat
		}
		kind := string(wav[offset : offset+4])
		size := int(binary.LittleEndian.Uint32(wav[offset+4 : offset+8]))
		offset += 8
		if size > len(wav)-offset {
			return nil, errVoiceFormat
		}
		chunk := wav[offset : offset+size]
		switch kind {
		case "fmt ":
			if format || len(chunk) < 16 || binary.LittleEndian.Uint16(chunk) != 1 || binary.LittleEndian.Uint16(chunk[2:]) != 1 || binary.LittleEndian.Uint32(chunk[4:]) != voiceSampleRate || binary.LittleEndian.Uint32(chunk[8:]) != voiceSampleRate*2 || binary.LittleEndian.Uint16(chunk[12:]) != 2 || binary.LittleEndian.Uint16(chunk[14:]) != 16 {
				return nil, errVoiceFormat
			}
			format = true
		case "data":
			if pcm != nil {
				return nil, errVoiceFormat
			}
			pcm = chunk
		}
		offset += size + size%2
		if offset > len(wav) {
			return nil, errVoiceFormat
		}
	}
	if !format || len(pcm) < 32 || len(pcm)%2 != 0 || len(pcm) > voiceSampleRate*30*2 {
		return nil, errVoiceFormat
	}
	return pcm, nil
}

// Pure Go, lossless encoding; no external ffmpeg process, filters or gain changes.
func compressVoice(pcm []byte) ([]byte, error) {
	const blockSize = 4096
	count := len(pcm) / 2
	minimum := blockSize
	if count < minimum {
		minimum = count
	} else if remainder := count % blockSize; remainder > 0 {
		minimum = remainder
		if minimum < 16 {
			minimum = 16
		}
	}
	info := &meta.StreamInfo{BlockSizeMin: uint16(minimum), BlockSizeMax: blockSize, SampleRate: voiceSampleRate, NChannels: 1, BitsPerSample: 16, NSamples: uint64(count), MD5sum: md5.Sum(pcm)}
	var output bytes.Buffer
	encoder, err := flac.NewEncoder(&output, info)
	if err != nil {
		return nil, err
	}
	for offset := 0; offset < count; {
		size := min(blockSize, count-offset)
		if remaining := count - offset - size; remaining > 0 && remaining < 16 {
			size -= 16 - remaining
		}
		samples := make([]int32, size)
		for i := range samples {
			samples[i] = int32(int16(binary.LittleEndian.Uint16(pcm[(offset+i)*2:])))
		}
		f := &frame.Frame{Header: frame.Header{HasFixedBlockSize: false, BlockSize: uint16(size), SampleRate: voiceSampleRate, Channels: frame.ChannelsMono, BitsPerSample: 16}, Subframes: []*frame.Subframe{{SubHeader: frame.SubHeader{Pred: frame.PredVerbatim}, Samples: samples, NSamples: size}}}
		if err = encoder.WriteFrame(f); err != nil {
			return nil, err
		}
		offset += size
	}
	if err = encoder.Close(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
