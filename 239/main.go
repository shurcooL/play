// Play with playing back mp3, ogg vorbis, wav audio files.
package main

import (
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"os"

	"github.com/go-audio/audio"
	"github.com/go-audio/wav"
	"github.com/hajimehoshi/go-mp3"
	"github.com/hajimehoshi/oto"
	"github.com/jfreymuth/oggvorbis"
)

func main() {
	err := playMP3("/Users/Dmitri/Dropbox/Music/Dead Fantasy.mp3")
	//err := playOggVorbis("/Users/Dmitri/Dropbox/Music/track1.ogg")
	//err := playWAV("/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/Hover/Hover/hypnotic.wav")
	if err != nil {
		log.Fatalln(err)
	}
}

func playMP3(name string) error {
	f, err := os.Open(name)
	if err != nil {
		return err
	}
	defer f.Close()
	dec, err := mp3.NewDecoder(f)
	if err != nil {
		return err
	}
	fmt.Println("source sample rate:", dec.SampleRate())
	playSampleRate := dec.SampleRate()
	fmt.Println("playing back at:", playSampleRate)
	ctx, err := oto.NewContext(playSampleRate, 2, 2, 65536)
	if err != nil {
		return err
	}
	defer ctx.Close()
	pl := ctx.NewPlayer()
	defer pl.Close()
	_, err = io.Copy(pl, dec)
	return err
}

func playOggVorbis(name string) error {
	f, err := os.Open(name)
	if err != nil {
		return err
	}
	defer f.Close()
	dec, err := oggvorbis.NewReader(f)
	if err != nil {
		return err
	}
	fmt.Println("source sample rate:", dec.SampleRate())
	playSampleRate := dec.SampleRate()
	fmt.Println("playing back at:", playSampleRate)
	ctx, err := oto.NewContext(playSampleRate, 2, 2, 65536)
	if err != nil {
		return err
	}
	defer ctx.Close()
	pl := ctx.NewPlayer()
	defer pl.Close()
	err = copyFloat32(pl, dec)
	return err
}

func copyFloat32(dst io.Writer, src float32Reader) error {
	buf := make([]float32, 8192)
	for {
		n, readError := src.Read(buf)
		for _, s := range buf[:n] {
			// [-1, +1] float32 → int16.
			v := int16(s * 32768)

			// Byte ordering is little endian.
			err := binary.Write(dst, binary.LittleEndian, v)
			if err != nil {
				return err
			}
		}
		if readError == io.EOF {
			return nil
		} else if readError != nil {
			return readError
		}
	}
}

type float32Reader interface {
	Read(p []float32) (int, error)
}

func playWAV(name string) error {
	f, err := os.Open(name)
	if err != nil {
		return err
	}
	defer f.Close()
	dec := wav.NewDecoder(f)
	if !dec.IsValidFile() {
		return fmt.Errorf("not valid wav file")
	}
	fmt.Println("source sample rate:", dec.SampleRate)
	playSampleRate := int(dec.SampleRate)
	fmt.Println("playing back at:", playSampleRate)
	ctx, err := oto.NewContext(playSampleRate, 2, 2, 65536)
	if err != nil {
		return err
	}
	defer ctx.Close()
	pl := ctx.NewPlayer()
	defer pl.Close()
	err = copyWAV(pl, dec)
	return err
}

func copyWAV(dst io.Writer, src *wav.Decoder) error {
	buf := audio.IntBuffer{Data: make([]int, 8192)}
	for {
		n, err := src.PCMBuffer(&buf)
		if err != nil {
			return err
		} else if n == 0 {
			return nil
		}
		for _, s := range buf.Data[:n] {
			// 16-bit int → int16.
			v := int16(s)

			// Byte ordering is little endian.
			err := binary.Write(dst, binary.LittleEndian, v)
			if err != nil {
				return err
			}
		}
	}
}
