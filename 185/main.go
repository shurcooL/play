// Play with crypto/rand in frontend.
package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {
	document.AddEventListener("DOMContentLoaded", false, func(dom.Event) {
		setup()
	})
}

func setup() {
	pre := document.CreateElement("pre").(*dom.HTMLPreElement)
	pre.Style().SetProperty("word-wrap", "break-word", "")
	document.Body().AppendChild(pre)
	stdout := NewWriter(pre)

	do := func() {
		encodedAccessToken := base64.RawURLEncoding.EncodeToString([]byte(newAccessToken()))
		fmt.Fprintf(stdout, "%q\n", encodedAccessToken)
	}
	do()
	document.AddEventListener("click", false, func(dom.Event) {
		do()
	})
}

func newAccessToken() string {
	b := make([]byte, 256)
	_, err := rand.Read(b)
	if err != nil {
		panic(err)
	}
	return string(b)
}

// NewWriter takes a <pre> element and makes an io.Writer out of it.
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
