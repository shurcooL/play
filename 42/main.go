package main

import (
	"net/http"

	"github.com/shurcooL/go/gopherjs_http"
)

func main() {
	http.Handle("/index.html", gopherjs_http.HtmlFile("./index_go.html"))
	panic(http.ListenAndServe(":8080", nil))
}
