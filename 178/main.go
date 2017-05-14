// Play with user logins and sessions.
package main

import (
	"encoding/base64"
	"errors"
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
	handler func(user *user, w HeaderWriter, req *http.Request) ([]*html.Node, error)
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
	case "/login/github":
		if req.Method != "POST" {
			w.Header().Set("Allow", "POST")
			http.Error(w, "method should be POST", http.StatusMethodNotAllowed)
			return
		}
	case "/logout":
		if req.Method != "POST" {
			w.Header().Set("Allow", "POST")
			http.Error(w, "method should be POST", http.StatusMethodNotAllowed)
			return
		}
	}

	u, err := getUser(req)
	if err == errBadAccessToken {
		// TODO: Is it okay if we later set the same cookie again? Or should we avoid doing this here?
		http.SetCookie(w, &http.Cookie{Path: "/", Name: accessTokenCookieName, MaxAge: -1})
	}

	nodes, err := h.handler(u, w, req)
	switch {
	case IsRedirect(err):
		http.Redirect(w, req, string(err.(Redirect).URL), http.StatusSeeOther)
	case IsHTTPError(err):
		http.Error(w, err.Error(), err.(HTTPError).Code)
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

type user struct {
	Login  string
	Domain string // Domain of user. Empty string means own domain.

	accessToken string // Internal access token. Needed to be able to clear session when this user signs out.
}

var errBadAccessToken = errors.New("bad access token")

// getUser either returns a valid user (possibly nil) and nil error, or
// nil user and errBadAccessToken.
func getUser(req *http.Request) (*user, error) {
	cookie, err := req.Cookie(accessTokenCookieName)
	if err == http.ErrNoCookie {
		return nil, nil // No user.
	} else if err != nil {
		return nil, errBadAccessToken
	}
	decodedAccessToken, err := base64.RawURLEncoding.DecodeString(cookie.Value)
	if err != nil {
		return nil, errBadAccessToken
	}
	accessToken := string(decodedAccessToken)
	var u *user
	sessions.mu.Lock()
	if user, ok := sessions.sessions[accessToken]; ok {
		u = &user
	}
	sessions.mu.Unlock()
	if u == nil {
		return nil, errBadAccessToken
	}
	return u, nil // Existing user.
}

func main() {
	fmt.Println("Started.")
	err := http.ListenAndServe(":8090", handler{
		handler: Handler,
	})
	if err != nil {
		log.Fatalln(err)
	}
}
