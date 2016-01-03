// Play with a react-like Render method that generates HTML for a page.
package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/shurcooL/htmlg"
)

type handler struct {
	Message string
}

func (h handler) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	nodes, err := h.Render(req)
	switch {
	case os.IsNotExist(err):
		log.Println(err)
		http.Error(w, err.Error(), http.StatusNotFound)
	case os.IsPermission(err):
		log.Println(err)
		http.Error(w, err.Error(), http.StatusUnauthorized)
	case err != nil:
		log.Println(err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
	default:
		w.Header().Set("Content-Type", "text/html")
		io.WriteString(w, string(htmlg.Render(nodes...)))
	}
}

func main() {
	fmt.Println("Started.")
	err := http.ListenAndServe(":8080", handler{Message: "Something important."})
	if err != nil {
		log.Fatalln(err)
	}
}
