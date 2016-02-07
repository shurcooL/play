// Play with user logins and sessions.
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

const (
	loginCookieName = "login"
)

type handler struct {
	render func(user *user, req *http.Request) ([]*html.Node, error)
}

func (h handler) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	var u *user
	switch req.URL.Path { // HACK.
	default:
		if req.Method != "GET" {
			w.Header().Set("Allow", "GET")
			http.Error(w, "method should be GET", http.StatusMethodNotAllowed)
			return
		}
	case "/login":
		if req.Method != "GET" && req.Method != "POST" {
			w.Header().Set("Allow", "GET, POST")
			http.Error(w, "method should be GET or POST", http.StatusMethodNotAllowed)
			return
		}

		if req.Method == "POST" { // HACK.
			req.ParseForm()
			login := req.PostForm.Get("login")
			http.SetCookie(w, &http.Cookie{Name: loginCookieName, Value: login})
			http.Redirect(w, req, "/", http.StatusFound)
			return
		}
	case "/logout":
		if req.Method != "POST" {
			w.Header().Set("Allow", "POST")
			http.Error(w, "method should be POST", http.StatusMethodNotAllowed)
			return
		}

		http.SetCookie(w, &http.Cookie{Name: loginCookieName, MaxAge: -1})
		http.Redirect(w, req, "/", http.StatusFound)
		return
	}

	if c, err := req.Cookie(loginCookieName); err == nil {
		u = new(user)
		u.Login = c.Value
	}

	nodes, err := h.render(u, req)
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
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(w, string(htmlg.Render(nodes...)))
	}
}

type user struct {
	Login string
}

func main() {
	fmt.Println("Started.")
	err := http.ListenAndServe(":8080", handler{render: render})
	if err != nil {
		log.Fatalln(err)
	}
}
