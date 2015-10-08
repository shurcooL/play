// +build js

// Play with HTML5 paste event, uploading image, etc.
package main

import (
	"bytes"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"

	"github.com/gopherjs/gopherjs/js"
	"honnef.co/go/js/dom"
)

const (
	host = "http://localhost:27080"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {}

func init() {
	document.AddEventListener("DOMContentLoaded", false, func(_ dom.Event) { setup() })
}

func setup() {
	textArea := document.GetElementByID("textarea").(*dom.HTMLTextAreaElement)

	textArea.AddEventListener("paste", false, func(e dom.Event) {
		ce := e.(*dom.ClipboardEvent)

		items := ce.Get("clipboardData").Get("items")
		if items.Length() == 0 {
			return
		}
		item := items.Index(0)
		if item.Get("kind").String() != "file" {
			return
		}
		if item.Get("type").String() != "image/png" {
			return
		}
		file := item.Call("getAsFile")

		go func() {
			resp, err := http.Get(host + "/api/getfilename?ext=" + "png")
			if err != nil {
				log.Println(err)
				return
			}
			defer resp.Body.Close()
			filename, err := ioutil.ReadAll(resp.Body)
			if err != nil {
				log.Println(err)
				return
			}

			url := host + "/" + string(filename)
			fmt.Println(url)
			insertText(textArea, "![Image]("+url+")\n")

			b := blobToBytes(file)
			fmt.Println("file size:", len(b))

			req, err := http.NewRequest("PUT", url, bytes.NewReader(b))
			if err != nil {
				log.Println(err)
				return
			}
			req.Header.Set("Content-Type", "application/octet-stream")
			resp, err = http.DefaultClient.Do(req)
			if err != nil {
				log.Println(err)
				return
			}
			_ = resp.Body.Close()

			fmt.Println("done")
		}()
	})
}

func insertText(t *dom.HTMLTextAreaElement, inserted string) {
	value, start, end := t.Value, t.SelectionStart, t.SelectionEnd
	t.Value = value[:start] + inserted + value[end:]
	t.SelectionStart, t.SelectionEnd = start+len(inserted), start+len(inserted)
}

// blobToBytes converts a Blob to []byte.
func blobToBytes(blob *js.Object) []byte {
	var b = make(chan []byte)
	fileReader := js.Global.Get("FileReader").New()
	fileReader.Set("onload", func() {
		b <- js.Global.Get("Uint8Array").New(fileReader.Get("result")).Interface().([]byte)
	})
	fileReader.Call("readAsArrayBuffer", blob)
	return <-b
}
