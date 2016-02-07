// Play with user logins and sessions.
package main

import (
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
)

const (
	accessTokenCookieName = "accessToken"
)

type handler struct {
	render func(user *user, req *http.Request) ([]*html.Node, error)
}

func (h handler) ServeHTTP(w http.ResponseWriter, req *http.Request) {
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
	case "/logout":
		if req.Method != "POST" {
			w.Header().Set("Allow", "POST")
			http.Error(w, "method should be POST", http.StatusMethodNotAllowed)
			return
		}
	}

	u := getUser(req)

	switch req.URL.Path { // HACK.
	case "/login":
		if req.Method == "POST" { // HACK.
			req.ParseForm()
			login := req.PostForm.Get("login")

			accessToken := newAccessToken()
			sessions.mu.Lock()
			sessions.sessions[accessToken] = login
			sessions.mu.Unlock()

			// TODO: Is base64 the best encoding for cookie values? Factor it out maybe?
			encodedAccessToken := base64.RawURLEncoding.EncodeToString([]byte(accessToken))
			http.SetCookie(w, &http.Cookie{Name: accessTokenCookieName, Value: encodedAccessToken, HttpOnly: true})
			http.Redirect(w, req, "/", http.StatusFound)
			return
		}
	case "/logout":
		if u != nil {
			sessions.mu.Lock()
			delete(sessions.sessions, u.accessToken)
			sessions.mu.Unlock()
		}

		http.SetCookie(w, &http.Cookie{Name: accessTokenCookieName, MaxAge: -1})
		http.Redirect(w, req, "/", http.StatusFound)
		return
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
	accessToken string
	Login       string
}

func getUser(req *http.Request) *user {
	cookie, err := req.Cookie(accessTokenCookieName)
	if err != nil {
		return nil
	}
	decodedAccessToken, err := base64.RawURLEncoding.DecodeString(cookie.Value)
	if err != nil {
		return nil
	}
	accessToken := string(decodedAccessToken)
	var u *user
	sessions.mu.Lock()
	if username, ok := sessions.sessions[accessToken]; ok {
		u = &user{
			Login:       username,
			accessToken: accessToken,
		}
	}
	sessions.mu.Unlock()
	return u
}

func main() {
	fmt.Println("Started.")
	err := http.ListenAndServe(":8080", handler{render: render})
	if err != nil {
		log.Fatalln(err)
	}
}
