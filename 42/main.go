package main

import (
	"net/http"

	"github.com/shurcooL/go/gopherjs_http"
)

func main() {
	http.Handle("/index.html", gopherjs_http.HtmlFile("./index_go.html"))
	http.Handle("/live-status.html", gopherjs_http.HtmlFile("/Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5190982.git/live-status-go.html"))
	panic(http.ListenAndServe(":8080", nil))
}
