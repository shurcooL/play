// +build !js

// Try switching pages in frontend by rendering different html/template, without reloading page.
package main

import (
	"net/http"

	"github.com/shurcooL/go/gopherjs_http"
	"github.com/shurcooL/httpgzip"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "index.html") })
	//http.Handle("/script/script.js", gopherjs_http.GoFiles("script/script.go"))
	http.Handle("/script/script.js", httpgzip.FileServer(gopherjs_http.NewFS(http.Dir(".")), httpgzip.FileServerOptions{ServeError: httpgzip.Detailed}))

	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		panic(err)
	}
}
