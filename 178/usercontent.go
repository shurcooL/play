package main

import (
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"

	"github.com/google/go-github/github"
	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
	"golang.org/x/oauth2"
)

func handlePost(u *user, w http.ResponseWriter, req *http.Request) {
	// Simple switch-based router for now. For a larger project, a more sophisticated router should be used.
	switch req.URL.Path {
	case "/login":
		if u != nil {
			http.Redirect(w, req, "/", http.StatusFound)
			return
		}

		login := req.PostFormValue("login")
		password := req.PostFormValue("password")
		switch login {
		case "shurcooL":
			if subtle.ConstantTimeCompare([]byte(password), []byte("abc")) != 1 {
				http.Redirect(w, req, "/login", http.StatusFound)
				return
			}
		}

		accessToken := cryptoRandString()
		sessions.mu.Lock()
		sessions.sessions[accessToken] = user{
			Login:       login,
			Domain:      "",
			accessToken: accessToken,
		}
		sessions.mu.Unlock()

		// TODO: Is base64 the best encoding for cookie values? Factor it out maybe?
		encodedAccessToken := base64.RawURLEncoding.EncodeToString([]byte(accessToken))
		http.SetCookie(w, &http.Cookie{Name: accessTokenCookieName, Value: encodedAccessToken, HttpOnly: true})
		http.Redirect(w, req, "/", http.StatusFound)
	case "/logout":
		if u != nil {
			sessions.mu.Lock()
			delete(sessions.sessions, u.accessToken)
			sessions.mu.Unlock()
		}

		http.SetCookie(w, &http.Cookie{Name: accessTokenCookieName, MaxAge: -1})
		http.Redirect(w, req, "/", http.StatusFound)
	}
}

func handleGet(u *user, w http.ResponseWriter, req *http.Request) {
	// Simple switch-based router for now. For a larger project, a more sophisticated router should be used.
	switch req.URL.Path {
	case "/login/github":
		if u != nil {
			http.Redirect(w, req, "/", http.StatusFound)
			return
		}

		state := cryptoRandString()
		goon.DumpExpr(state)

		url := gitHubConfig.AuthCodeURL(state)
		http.Redirect(w, req, url, http.StatusFound)
	case "/callback/github":
		if u != nil {
			http.Redirect(w, req, "/", http.StatusFound)
			return
		}

		// TODO: Validate state.
		ghUser, err := func() (*github.User, error) {
			state := req.FormValue("state")
			goon.DumpExpr(state)

			token, err := gitHubConfig.Exchange(oauth2.NoContext, req.FormValue("code"))
			if err != nil {
				return nil, err
			}
			tc := gitHubConfig.Client(oauth2.NoContext, token)
			gh := github.NewClient(tc)

			user, _, err := gh.Users.Get("")
			if err != nil {
				return nil, err
			}
			if user.ID == nil || *user.ID == 0 {
				return nil, errors.New("user id is 0")
			}
			if user.Login == nil || *user.Login == "" {
				return nil, errors.New("user login is empty")
			}
			return user, nil
		}()
		if err != nil {
			log.Println(err)
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		accessToken := cryptoRandString()
		sessions.mu.Lock()
		sessions.sessions[accessToken] = user{
			Login:       *ghUser.Login,
			Domain:      "github.com",
			accessToken: accessToken,
		}
		sessions.mu.Unlock()

		// TODO: Is base64 the best encoding for cookie values? Factor it out maybe?
		encodedAccessToken := base64.RawURLEncoding.EncodeToString([]byte(accessToken))
		http.SetCookie(w, &http.Cookie{Name: accessTokenCookieName, Value: encodedAccessToken, HttpOnly: true})
		http.Redirect(w, req, "/", http.StatusFound)
	}
}

// renderGet returns rendered HTML for the given request or an error.
func renderGet(u *user, req *http.Request) ([]*html.Node, error) {
	// Simple switch-based router for now. For a larger project, a more sophisticated router should be used.
	switch req.URL.Path {
	case "/":
		nodes := []*html.Node{
			htmlg.Div(
				htmlg.Strong("Home"),
			),
			htmlg.Div(htmlg.Text("-")),
		}
		switch u {
		case nil:
			nodes = append(nodes,
				htmlg.Div(
					htmlg.Text("Not signed in."),
					htmlg.Text(" "),
					htmlg.A("Sign in", "/login"),
					htmlg.Text(" "),
					htmlg.A("Sign in via GitHub", "/login/github"),
				),
			)
		default:
			nodes = append(nodes,
				htmlg.Div(
					htmlg.Text(fmt.Sprintf("Logged in as: %q (from domain %q)", u.Login, u.Domain)),
					htmlg.Text(" "),
					form("post", "/logout",
						input("submit", "", "Logout"),
					),
				),
			)
		}
		return nodes, nil
	case "/login":
		return []*html.Node{
			htmlg.Div(
				form("post", "/login",
					htmlg.Text("Username:"),
					htmlg.Text(" "),
					input("text", "login", ""),
					htmlg.Text(" "),
					htmlg.Text("Password:"),
					htmlg.Text(" "),
					input("password", "password", ""),
					htmlg.Text(" "),
					input("submit", "", "Login"),
				),
			),
		}, nil
	case "/sessions":
		var nodes []*html.Node
		sessions.mu.Lock()
		for _, u := range sessions.sessions {
			nodes = append(nodes,
				htmlg.Div(htmlg.Text(fmt.Sprintf("%#v", u))),
			)
		}
		if len(sessions.sessions) == 0 {
			nodes = append(nodes,
				htmlg.Div(htmlg.Text("-")),
			)
		}
		sessions.mu.Unlock()
		return nodes, nil
	default:
		return nil, &os.PathError{Op: "open", Path: req.URL.String(), Err: os.ErrNotExist}
	}
}

func input(typ, name, value string, nodes ...*html.Node) *html.Node {
	input := &html.Node{
		Type: html.ElementNode, Data: atom.Input.String(),
		Attr: []html.Attribute{
			{Key: atom.Type.String(), Val: typ},
			{Key: atom.Name.String(), Val: name},
			{Key: atom.Value.String(), Val: value},
		},
	}
	for _, n := range nodes {
		input.AppendChild(n)
	}
	return input
}

func form(method string, action template.URL, nodes ...*html.Node) *html.Node {
	form := &html.Node{
		Type: html.ElementNode, Data: atom.Form.String(),
		Attr: []html.Attribute{
			{Key: atom.Method.String(), Val: method},
			{Key: atom.Action.String(), Val: string(action)},
		},
	}
	for _, n := range nodes {
		form.AppendChild(n)
	}
	return form
}
