// +build !js

// Try switching pages in frontend by rendering different html/template, without reloading page.
package main

import (
	"net/http"

	"github.com/shurcooL/go/gopherjs_http"
	"github.com/shurcooL/go/gzip_file_server"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "index.html") })
	//http.Handle("/script/script.js", gopherjs_http.GoFiles("script/script.go"))
	http.Handle("/script/script.js", gzip_file_server.New(gopherjs_http.NewFS(http.Dir("."))))

	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		panic(err)
	}
}
