// +build js

package main

import (
	"io"

	"honnef.co/go/js/dom"
)

// NewReader takes an <input> element and makes an io.Reader out of it.
func NewReader(e *dom.HTMLInputElement) io.Reader {
	r := &reader{
		in: make(chan []byte),
	}
	e.AddEventListener("keydown", false, func(event dom.Event) {
		ke := event.(*dom.KeyboardEvent)
		go func() {
			if ke.KeyCode == 13 {
				r.in <- []byte(e.Value + "\n")
				e.Value = ""
				ke.PreventDefault()
			}
		}()
	})
	return r
}

type reader struct {
	pending []byte
	in      chan []byte // This channel is never closed here, so no need to detect it and return io.EOF.
}

func (r *reader) Read(p []byte) (n int, err error) {
	if len(r.pending) == 0 {
		r.pending = <-r.in
	}
	n = copy(p, r.pending)
	r.pending = r.pending[n:]
	return n, nil
}

// NewWriter takes a <pre> element and makes a writer out of it.
func NewWriter(e *dom.HTMLPreElement) io.Writer {
	return &writer{e: e}
}

type writer struct {
	e *dom.HTMLPreElement
}

func (w *writer) Write(p []byte) (n int, err error) {
	w.e.SetTextContent(w.e.TextContent() + string(p))
	return len(p), nil
}
