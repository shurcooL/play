// Learn about Quip API.
package main

import (
	"io"
	"net/http"
	"time"

	"github.com/mduvall/go-quip"
	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/go/openutil"
)

func main() {
	q := quip.NewClient("")

	thread := q.GetThread("")
	goon.DumpExpr(thread)

	mux := http.NewServeMux()
	stopServerChan := make(chan struct{})
	mux.HandleFunc("/index.html", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(w, thread.Html)
		go func() {
			time.Sleep(time.Second)
			stopServerChan <- struct{}{}
		}()
	})
	openutil.DisplayHTMLInBrowser(mux, stopServerChan, ".html")
}
