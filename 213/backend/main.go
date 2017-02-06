package main

import (
	"context"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/shurcooL/home/httputil"
	"github.com/shurcooL/home/idiomaticgo"
	"github.com/shurcooL/httperror"
	issuesfs "github.com/shurcooL/issues/fs"
	"github.com/shurcooL/notifications"
	reactionsfs "github.com/shurcooL/reactions/fs"
	"github.com/shurcooL/resume"
	"github.com/shurcooL/users"
	"golang.org/x/net/webdav"
)

var resumeHTML = template.Must(template.New("").Parse(`<html>
	<head>
		<title>Dmitri Shuralyov - Resume</title>
		<link href="/icon.png" rel="icon" type="image/png">
		<link href="/blog/assets/octicons/octicons.min.css" rel="stylesheet" type="text/css">
		<link href="/resume.css" rel="stylesheet" type="text/css">

		<script async src="/resume.js"></script>
	</head>
	<body>`))

var idiomaticGoHTML = template.Must(template.New("").Parse(`<html>
	<head>
		<title>Idiomatic Go</title>
		<link href="/icon.png" rel="icon" type="image/png">
		<link href="/blog/assets/octicons/octicons.min.css" rel="stylesheet" type="text/css">
		<link href="/blog/assets/gfm/gfm.css" rel="stylesheet" type="text/css">
		<link href="/assets/idiomaticgo/style.css" rel="stylesheet" type="text/css">

		<script async src="/assets/idiomaticgo/idiomaticgo.js"></script>
	</head>
	<body>`))

func run() error {
	users := mockUsers{}
	reactions, err := reactionsfs.NewService(
		webdav.Dir(filepath.Join(os.Getenv("HOME"), "Dropbox", "Store", "reactions")),
		users)
	if err != nil {
		return err
	}
	notifications := mockNotifications{}
	issues, err := issuesfs.NewService(
		webdav.Dir(filepath.Join(os.Getenv("HOME"), "Dropbox", "Store", "issues")),
		notifications, users)
	if err != nil {
		return err
	}

	http.Handle("/resume", httputil.ErrorHandler(users, func(w http.ResponseWriter, req *http.Request) error {
		if req.Method != "GET" {
			return httperror.Method{Allowed: []string{"GET"}}
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		err := resumeHTML.Execute(w, nil)
		if err != nil {
			return err
		}

		// Server-side rendering (for now).
		authenticatedUser, err := users.GetAuthenticated(req.Context())
		if err != nil {
			return err
		}
		returnURL := req.RequestURI
		err = resume.RenderBodyInnerHTML(req.Context(), w, reactions, notifications, authenticatedUser, returnURL)
		if err != nil {
			return err
		}

		_, err = io.WriteString(w, `</body></html>`)
		return err
	}))

	http.Handle("/idiomatic-go", httputil.ErrorHandler(users, func(w http.ResponseWriter, req *http.Request) error {
		if req.Method != "GET" {
			return httperror.Method{Allowed: []string{"GET"}}
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		err := resumeHTML.Execute(w, nil)
		if err != nil {
			return err
		}

		// Server-side rendering (for now).
		authenticatedUser, err := users.GetAuthenticated(req.Context())
		if err != nil {
			return err
		}
		returnURL := req.RequestURI
		err = idiomaticgo.RenderBodyInnerHTML(req.Context(), w, issues, notifications, authenticatedUser, returnURL)
		if err != nil {
			return err
		}

		_, err = io.WriteString(w, `</body></html>`)
		return err
	}))

	return http.ListenAndServe(":8080", nil)
}

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

type mockUsers struct{ users.Service }

func (mockUsers) Get(_ context.Context, user users.UserSpec) (users.User, error) {
	if user.ID == 0 {
		return users.User{}, fmt.Errorf("user %v not found", user)
	}
	return users.User{
		UserSpec:  user,
		Login:     fmt.Sprintf("%d@%s", user.ID, user.Domain),
		AvatarURL: "https://secure.gravatar.com/avatar?d=mm&f=y&s=96",
		HTMLURL:   "",
	}, nil
}

func (mockUsers) GetAuthenticatedSpec(_ context.Context) (users.UserSpec, error) {
	return users.UserSpec{ID: 1, Domain: "example.org"}, nil
}

func (m mockUsers) GetAuthenticated(ctx context.Context) (users.User, error) {
	userSpec, err := m.GetAuthenticatedSpec(ctx)
	if err != nil {
		return users.User{}, err
	}
	if userSpec.ID == 0 {
		return users.User{}, nil
	}
	return m.Get(ctx, userSpec)
}

type mockNotifications struct{ notifications.Service }

func (mockNotifications) Count(_ context.Context, opt interface{}) (uint64, error) { return 0, nil }
