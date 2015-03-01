// Try switching pages in frontend by rendering different html/template, without reloading page.
package main

import (
	"net/http"

	"github.com/shurcooL/go/gopherjs_http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "./index.html") })
	http.Handle("/script.js", gopherjs_http.GoFiles("./script.go"))

	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		panic(err)
	}
}
