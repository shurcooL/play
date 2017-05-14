// Play with a react-like Render method that generates HTML for a page.
package main

import (
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/shurcooL/htmlg"
)

type handler struct{}

func (h handler) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	nodes, err := h.Render(req)
	switch {
	default:
		w.Header().Set("Content-Type", "text/html")
		io.WriteString(w, htmlg.Render(nodes...))
	case IsRedirect(err):
		http.Redirect(w, req, string(err.(Redirect).URL), http.StatusSeeOther)
	case os.IsNotExist(err):
		log.Println(err)
		http.Error(w, err.Error(), http.StatusNotFound)
	case os.IsPermission(err):
		log.Println(err)
		http.Error(w, err.Error(), http.StatusForbidden)
	case err != nil:
		log.Println(err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// Redirect is an error type used for representing a simple HTTP redirection.
type Redirect struct {
	URL template.URL
}

func (r Redirect) Error() string { return fmt.Sprintf("redirecting to %s", r.URL) }

func IsRedirect(err error) bool {
	_, ok := err.(Redirect)
	return ok
}

func main() {
	fmt.Println("Started.")
	err := http.ListenAndServe(":8080", handler{})
	if err != nil {
		log.Fatalln(err)
	}
}
