// Play with a react-like Render method that generates HTML for a page.
package main

import (
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
)

type handler struct {
	Message string
}

func (h handler) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "text/html")
	io.WriteString(w, string(htmlg.Render(h.Render(req)...)))
}

func (h handler) Render(req *http.Request) []*html.Node {
	return []*html.Node{
		htmlg.Div(
			htmlg.Text(req.URL.Path),
		),
		htmlg.Div(
			htmlg.A("Home Link", "/home"),
		),
		htmlg.Div(
			htmlg.Strong(h.Message),
		),
	}
}

func main() {
	fmt.Println("Started.")
	err := http.ListenAndServe(":8080", handler{Message: "Something important."})
	if err != nil {
		log.Fatalln(err)
	}
}
