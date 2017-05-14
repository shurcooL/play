// Play with an experimental web server that generates HTML pages in a type safe way
// on the backend only.
package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
)

type handler struct {
	// handler is a GET-only handler for serving text/plain content.
	// It verifies that req.Method is GET, and rejects the request otherwise.
	render func(req *http.Request) ([]*html.Node, error)
}

func (h handler) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	if req.Method != "GET" {
		w.Header().Set("Allow", "GET")
		http.Error(w, "method should be GET", http.StatusMethodNotAllowed)
		return
	}
	nodes, err := h.render(req)
	switch {
	case os.IsNotExist(err):
		log.Println(err)
		http.Error(w, err.Error(), http.StatusNotFound)
	case os.IsPermission(err):
		log.Println(err)
		http.Error(w, err.Error(), http.StatusForbidden)
	case err != nil:
		log.Println(err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
	default:
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(w, htmlg.Render(nodes...))
	}
}

func main() {
	fmt.Println("Started.")
	err := http.ListenAndServe(":8080", handler{render: render})
	if err != nil {
		log.Fatalln(err)
	}
}
