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
	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
	"golang.org/x/oauth2"
)

func Handler(u *user, w HeaderWriter, req *http.Request) ([]*html.Node, error) {
	// Simple switch-based router for now. For a larger project, a more sophisticated router should be used.
	switch {
	case req.Method == "GET" && req.URL.Path == "/":
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
					style(
						"display: inline-block;",
						form("post", "/login/github",
							input("submit", "", "Sign in via GitHub"),
						),
					),
				),
			)
		default:
			nodes = append(nodes,
				htmlg.Div(
					htmlg.Text(fmt.Sprintf("Logged in as: %q (from domain %q)", u.Login, u.Domain)),
					htmlg.Text(" "),
					style(
						"display: inline-block;",
						form("post", "/logout",
							input("submit", "", "Logout"),
						),
					),
				),
			)
		}
		return nodes, nil
	case req.Method == "GET" && req.URL.Path == "/login":
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
					input("submit", "", "Sign in"),
				),
			),
		}, nil
	case req.Method == "POST" && req.URL.Path == "/login":
		if u != nil {
			return nil, Redirect{URL: "/"}
		}

		login := req.PostFormValue("login")
		password := req.PostFormValue("password")
		switch login {
		case "shurcooL":
			if subtle.ConstantTimeCompare([]byte(password), []byte("abc")) != 1 {
				return nil, Redirect{URL: "/login"}
			}
		}

		accessToken := string(cryptoRandBytes())
		sessions.mu.Lock()
		sessions.sessions[accessToken] = user{
			Login:       login,
			Domain:      "",
			accessToken: accessToken,
		}
		sessions.mu.Unlock()

		// TODO: Is base64 the best encoding for cookie values? Factor it out maybe?
		encodedAccessToken := base64.RawURLEncoding.EncodeToString([]byte(accessToken))
		SetCookie(w, &http.Cookie{Path: "/", Name: accessTokenCookieName, Value: encodedAccessToken, HttpOnly: true})
		return nil, Redirect{URL: "/"}
	case req.Method == "POST" && req.URL.Path == "/login/github":
		if u != nil {
			return nil, Redirect{URL: "/"}
		}

		state := base64.RawURLEncoding.EncodeToString(cryptoRandBytes()) // GitHub doesn't handle all non-ascii bytes in state, so use base64.
		SetCookie(w, &http.Cookie{Path: "/callback/github", Name: stateCookieName, Value: state, HttpOnly: true})

		url := githubConfig.AuthCodeURL(state)
		return nil, Redirect{URL: url}
	case req.Method == "GET" && req.URL.Path == "/callback/github":
		if u != nil {
			return nil, Redirect{URL: "/"}
		}

		ghUser, err := func() (*github.User, error) {
			// Validate state (to prevent CSRF).
			cookie, err := req.Cookie(stateCookieName)
			if err != nil {
				return nil, err
			}
			SetCookie(w, &http.Cookie{Path: "/callback/github", Name: stateCookieName, MaxAge: -1})
			state := req.FormValue("state")
			if cookie.Value != state {
				return nil, errors.New("state doesn't match")
			}

			token, err := githubConfig.Exchange(oauth2.NoContext, req.FormValue("code"))
			if err != nil {
				return nil, err
			}
			tc := githubConfig.Client(oauth2.NoContext, token)
			gh := github.NewClient(tc)

			user, _, err := gh.Users.Get("")
			if err != nil {
				return nil, err
			}
			if user.ID == nil || *user.ID == 0 {
				return nil, errors.New("user id is nil/0")
			}
			if user.Login == nil || *user.Login == "" {
				return nil, errors.New("user login is unset/empty")
			}
			return user, nil
		}()
		if err != nil {
			log.Println(err)
			return nil, HTTPError{Code: http.StatusUnauthorized, err: err}
		}

		accessToken := string(cryptoRandBytes())
		sessions.mu.Lock()
		sessions.sessions[accessToken] = user{
			Login:       *ghUser.Login,
			Domain:      "github.com",
			accessToken: accessToken,
		}
		sessions.mu.Unlock()

		// TODO: Is base64 the best encoding for cookie values? Factor it out maybe?
		encodedAccessToken := base64.RawURLEncoding.EncodeToString([]byte(accessToken))
		SetCookie(w, &http.Cookie{Path: "/", Name: accessTokenCookieName, Value: encodedAccessToken, HttpOnly: true})
		return nil, Redirect{URL: "/"}
	case req.Method == "POST" && req.URL.Path == "/logout":
		if u != nil {
			sessions.mu.Lock()
			delete(sessions.sessions, u.accessToken)
			sessions.mu.Unlock()
		}

		SetCookie(w, &http.Cookie{Path: "/", Name: accessTokenCookieName, MaxAge: -1})
		return nil, Redirect{URL: "/"}
	case req.Method == "GET" && req.URL.Path == "/sessions":
		// Authorization check.
		if u == nil || u.Login != "shurcooL" || u.Domain != "github.com" {
			return nil, &os.PathError{Op: "open", Path: req.URL.String(), Err: os.ErrPermission}
		}

		var nodes []*html.Node
		sessions.mu.Lock()
		for _, u := range sessions.sessions {
			nodes = append(nodes,
				htmlg.Div(htmlg.Text(fmt.Sprintf("Login: %q Domain: %q accessToken: %q...", u.Login, u.Domain, base64.RawURLEncoding.EncodeToString([]byte(u.accessToken))[:20]))),
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
	htmlg.AppendChildren(input, nodes...)
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
	htmlg.AppendChildren(form, nodes...)
	return form
}

func style(style string, n *html.Node) *html.Node {
	if n.Type != html.ElementNode {
		panic("invalid node type")
	}
	n.Attr = append(n.Attr, html.Attribute{Key: atom.Style.String(), Val: style})
	return n
}
