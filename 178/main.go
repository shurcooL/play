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
	stateCookieName       = "state"
)

type handler struct {
	// handlePost is a POST-only handler. All requests are guaranteed to be POST.
	handlePost func(user *user, w http.ResponseWriter, req *http.Request)

	// handleGet is a GET-only handler. All requests are guaranteed to be GET.
	handleGet func(user *user, w http.ResponseWriter, req *http.Request)

	// renderGet is a GET-only handler. All requests are guaranteed to be GET.
	renderGet func(user *user, req *http.Request) ([]*html.Node, error)
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

	switch req.Method {
	case "POST":
		h.handlePost(u, w, req)
	case "GET":
		switch req.URL.Path { // HACK, TODO: Get rid of this hardcoded special case. Use normal `http.Handle`s?
		case "/login/github", "/callback/github":
			h.handleGet(u, w, req)
			return
		}

		nodes, err := h.renderGet(u, req)
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
	default:
		panic("unreachable") // Shouldn't happen because of method/route verification at the top.
	}
}

type user struct {
	Login  string
	Domain string // Domain of user. Empty string means own domain.

	accessToken string // Internal access token. Needed to be able to clear session when this user signs out.
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
	if user, ok := sessions.sessions[accessToken]; ok {
		u = &user
	}
	sessions.mu.Unlock()
	return u
}

func main() {
	fmt.Println("Started.")
	err := http.ListenAndServe(":8090", handler{
		handlePost: handlePost,
		handleGet:  handleGet,
		renderGet:  renderGet,
	})
	if err != nil {
		log.Fatalln(err)
	}
}
