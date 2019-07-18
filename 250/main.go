// Play with rendering a header component on the frontend,
// with support for both light and dark color schemes.
//
// It is a Go package meant to be compiled with GOARCH=js
// and executed in a browser, where the DOM is available.
package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"

	"github.com/gopherjs/gopherjs/js"
	"github.com/shurcooL/htmlg"
	"github.com/shurcooL/play/250/component"
	"github.com/shurcooL/users"
	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {
	switch readyState := document.ReadyState(); readyState {
	case "loading":
		document.AddEventListener("DOMContentLoaded", false, func(dom.Event) {
			go setup(context.Background())
		})
	case "interactive", "complete":
		setup(context.Background())
	default:
		panic(fmt.Errorf("internal error: unexpected document.ReadyState value: %v", readyState))
	}
}

func setup(ctx context.Context) {
	// Use Go font.
	fontsCSSLink := document.CreateElement("link")
	fontsCSSLink.SetAttribute("href", "https://dmitri.shuralyov.com/assets/fonts/fonts.css")
	fontsCSSLink.SetAttribute("rel", "stylesheet")
	fontsCSSLink.SetAttribute("type", "text/css")
	document.Head().InsertBefore(fontsCSSLink, nil)
	document.Body().Style().SetProperty("font-family", "Go", "")

	// Set background color based on color scheme.
	onChange := func(event *js.Object) {
		darkColorScheme := event.Get("matches").Bool()
		switch darkColorScheme {
		case false:
			document.Body().Style().RemoveProperty("background-color")
		case true:
			document.Body().Style().SetProperty("background-color", "rgb(30, 30, 30)", "")
		}
	}
	mql := js.Global.Call("matchMedia", "(prefers-color-scheme: dark)")
	mql.Call("addListener", onChange)
	onChange(mql)

	// Render body.
	var buf bytes.Buffer
	err := renderBodyInnerHTML(ctx, &buf)
	if err != nil {
		log.Println(err)
		return
	}
	document.Body().SetInnerHTML(buf.String())
}

// renderBodyInnerHTML renders the inner HTML of the <body> element of the page that displays the resume.
// It's safe for concurrent use.
func renderBodyInnerHTML(ctx context.Context, w io.Writer) error {
	_, err := io.WriteString(w, `<div style="max-width: 800px; margin: 0 auto 100px auto;">`)
	if err != nil {
		return err
	}

	// Render the header.
	header := component.Header{
		CurrentUser:       users.User{},
		NotificationCount: 1,
		ReturnURL:         "",
	}
	err = htmlg.RenderComponents(w, header)
	if err != nil {
		return err
	}

	_, err = io.WriteString(w, `</div>`)
	return err
}
