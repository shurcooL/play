package main

import (
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/shurcooL/home/httphandler"
	"github.com/shurcooL/home/httputil"
	"github.com/shurcooL/home/idiomaticgo"
	"github.com/shurcooL/httperror"
	"github.com/shurcooL/httpgzip"
	issuesfs "github.com/shurcooL/issues/fs"
	"github.com/shurcooL/notifications"
	notificationshttphandler "github.com/shurcooL/notificationsapp/httphandler"
	"github.com/shurcooL/notificationsapp/httproute"
	"github.com/shurcooL/play/213/frontend/assets"
	reactionsfs "github.com/shurcooL/reactions/fs"
	"github.com/shurcooL/resume"
	"github.com/shurcooL/users"
	"golang.org/x/net/webdav"
)

var (
	backendDelay = time.Second
)

var resumeHTML = template.Must(template.New("").Parse(`<html>
	<head>
		<title>Dmitri Shuralyov - Resume</title>
		<link href="/icon.png" rel="icon" type="image/png">
		<link href="/blog/assets/octicons/octicons.min.css" rel="stylesheet" type="text/css">
		<link href="/resume.css" rel="stylesheet" type="text/css">

		<script async src="/script.js"></script>
	</head>
	<body>`))

var idiomaticGoHTML = template.Must(template.New("").Parse(`<html>
	<head>
		<title>Idiomatic Go</title>
		<link href="/icon.png" rel="icon" type="image/png">
		<link href="/blog/assets/octicons/octicons.min.css" rel="stylesheet" type="text/css">
		<link href="/blog/assets/gfm/gfm.css" rel="stylesheet" type="text/css">
		<link href="/assets/idiomaticgo/style.css" rel="stylesheet" type="text/css">

		<script async src="/script.js"></script>
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
		notifications, nil, users)
	if err != nil {
		return err
	}

	usersAPIHandler := httphandler.Users{Users: users}
	http.Handle("/api/userspec", httputil.ErrorHandler(users, usersAPIHandler.GetAuthenticatedSpec))
	http.Handle("/api/user", httputil.ErrorHandler(users, usersAPIHandler.GetAuthenticated))

	reactionsAPIHandler := httphandler.Reactions{Reactions: reactions}
	http.Handle("/api/react", httputil.ErrorHandler(users, reactionsAPIHandler.GetOrToggle))
	http.Handle("/api/react/list", httputil.ErrorHandler(users, reactionsAPIHandler.List))

	notificationsAPIHandler := notificationshttphandler.Notifications{Notifications: notifications}
	http.Handle(httproute.List, httputil.ErrorHandler(users, notificationsAPIHandler.List))
	http.Handle(httproute.Count, httputil.ErrorHandler(users, notificationsAPIHandler.Count))
	http.Handle(httproute.MarkRead, httputil.ErrorHandler(users, notificationsAPIHandler.MarkRead))
	http.Handle(httproute.MarkAllRead, httputil.ErrorHandler(users, notificationsAPIHandler.MarkAllRead))

	issuesAPIHandler := httphandler.Issues{Issues: issues}
	http.Handle("/api/issues/list", httputil.ErrorHandler(users, issuesAPIHandler.List))
	http.Handle("/api/issues/count", httputil.ErrorHandler(users, issuesAPIHandler.Count))
	http.Handle("/api/issues/list-comments", httputil.ErrorHandler(users, issuesAPIHandler.ListComments))
	http.Handle("/api/issues/edit-comment", httputil.ErrorHandler(users, issuesAPIHandler.EditComment))

	http.Handle("/", httpgzip.FileServer(assets.Assets, httpgzip.FileServerOptions{ServeError: httpgzip.Detailed}))

	http.Handle("/resume", httputil.ErrorHandler(users, func(w http.ResponseWriter, req *http.Request) error {
		if req.Method != "GET" {
			return httperror.Method{Allowed: []string{"GET"}}
		}

		time.Sleep(backendDelay) // XXX: Artifical delay.

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

		time.Sleep(backendDelay) // XXX: Artifical delay.

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

	log.Println("Started.")
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

type mockNotifications struct {
	notifications.ExternalService
}

func (mockNotifications) List(ctx context.Context, opt notifications.ListOptions) (notifications.Notifications, error) {
	return ns, nil
}

func (mockNotifications) Count(ctx context.Context, opt interface{}) (uint64, error) {
	return uint64(len(ns)), nil
}

func (mockNotifications) MarkRead(ctx context.Context, appID string, repo notifications.RepoSpec, threadID uint64) error {
	// TODO: Perhaps have it modify what List returns, etc.
	return nil
}

func (mockNotifications) MarkAllRead(ctx context.Context, repo notifications.RepoSpec) error {
	// TODO: Perhaps have it modify what List returns, etc.
	return nil
}

// errorHandler factors error handling out of the HTTP handler.
type errorHandler func(w http.ResponseWriter, req *http.Request) error

func (h errorHandler) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	err := h(w, req)
	if err == nil {
		// Do nothing.
		return
	}
	if err, ok := httperror.IsMethod(err); ok {
		httperror.HandleMethod(w, err)
		return
	}
	if err, ok := httperror.IsRedirect(err); ok {
		http.Redirect(w, req, err.URL, http.StatusSeeOther)
		return
	}
	if err, ok := httperror.IsBadRequest(err); ok {
		httperror.HandleBadRequest(w, err)
		return
	}
	if err, ok := httperror.IsHTTP(err); ok {
		code := err.Code
		error := fmt.Sprintf("%d %s", code, http.StatusText(code))
		if code == http.StatusBadRequest {
			error += "\n\n" + err.Error()
		}
		http.Error(w, error, code)
		return
	}
	if err, ok := httperror.IsJSONResponse(err); ok {
		w.Header().Set("Content-Type", "application/json")
		jw := json.NewEncoder(w)
		jw.SetIndent("", "\t")
		err := jw.Encode(err.V)
		if err != nil {
			log.Println("error encoding JSONResponse:", err)
		}
		return
	}
	if os.IsNotExist(err) {
		log.Println(err)
		http.Error(w, "404 Not Found", http.StatusNotFound)
		return
	}
	if os.IsPermission(err) {
		log.Println(err)
		http.Error(w, "403 Forbidden", http.StatusForbidden)
		return
	}

	log.Println(err)
	http.Error(w, "500 Internal Server Error", http.StatusInternalServerError)
}

// ns is a list of mock notifications.
var ns = func() notifications.Notifications {
	passed := time.Since(time.Date(1, 1, 1, 0, 0, 63621777703, 945428426, time.UTC))
	return (notifications.Notifications)(notifications.Notifications{
		(notifications.Notification)(notifications.Notification{
			AppID: (string)("PullRequest"),
			RepoSpec: (notifications.RepoSpec)(notifications.RepoSpec{
				URI: (string)("github.com/bradleyfalzon/gopherci"),
			}),
			ThreadID: (uint64)(60),
			RepoURL:  (string)("https://github.com/bradleyfalzon/gopherci"),
			Title:    (string)("Support GitHub PushEvent"),
			Icon:     (notifications.OcticonID)("git-pull-request"),
			Color: (notifications.RGB)(notifications.RGB{
				R: (uint8)(108),
				G: (uint8)(198),
				B: (uint8)(68),
			}),
			Actor: (users.User)(users.User{
				UserSpec: (users.UserSpec)(users.UserSpec{
					ID:     (uint64)(2354108),
					Domain: (string)("github.com"),
				}),
				Elsewhere: ([]users.UserSpec)(nil),
				Login:     (string)("coveralls"),
				Name:      (string)(""),
				Email:     (string)(""),
				AvatarURL: (string)("https://avatars.githubusercontent.com/u/2354108?s=36&v=3"),
				HTMLURL:   (string)("https://github.com/coveralls"),
				CreatedAt: (time.Time)(time.Time{}),
				UpdatedAt: (time.Time)(time.Time{}),
				SiteAdmin: (bool)(false),
			}),
			UpdatedAt: (time.Time)(time.Date(1, 1, 1, 0, 0, 63621776801, 0, time.UTC).Add(passed)),
			HTMLURL:   (string)("https://github.com/bradleyfalzon/gopherci/pull/60#comment-277416148"),
		}),
		(notifications.Notification)(notifications.Notification{
			AppID: (string)("PullRequest"),
			RepoSpec: (notifications.RepoSpec)(notifications.RepoSpec{
				URI: (string)("github.com/ryanuber/go-glob"),
			}),
			ThreadID: (uint64)(5),
			RepoURL:  (string)("https://github.com/ryanuber/go-glob"),
			Title:    (string)("Add GlobI for case-insensitive globbing"),
			Icon:     (notifications.OcticonID)("git-pull-request"),
			Color: (notifications.RGB)(notifications.RGB{
				R: (uint8)(108),
				G: (uint8)(198),
				B: (uint8)(68),
			}),
			Actor: (users.User)(users.User{
				UserSpec: (users.UserSpec)(users.UserSpec{
					ID:     (uint64)(3022496),
					Domain: (string)("github.com"),
				}),
				Elsewhere: ([]users.UserSpec)(nil),
				Login:     (string)("blockloop"),
				Name:      (string)(""),
				Email:     (string)(""),
				AvatarURL: (string)("https://avatars.githubusercontent.com/u/3022496?s=36&v=3"),
				HTMLURL:   (string)("https://github.com/blockloop"),
				CreatedAt: (time.Time)(time.Time{}),
				UpdatedAt: (time.Time)(time.Time{}),
				SiteAdmin: (bool)(false),
			}),
			UpdatedAt: (time.Time)(time.Date(1, 1, 1, 0, 0, 63621776446, 0, time.UTC).Add(passed)),
			HTMLURL:   (string)("https://github.com/ryanuber/go-glob/pull/5#comment-277415841"),
		}),
		(notifications.Notification)(notifications.Notification{
			AppID: (string)("Issue"),
			RepoSpec: (notifications.RepoSpec)(notifications.RepoSpec{
				URI: (string)("github.com/nsf/gocode"),
			}),
			ThreadID: (uint64)(419),
			RepoURL:  (string)("https://github.com/nsf/gocode"),
			Title:    (string)("panic: unknown export format version 4"),
			Icon:     (notifications.OcticonID)("issue-closed"),
			Color: (notifications.RGB)(notifications.RGB{
				R: (uint8)(189),
				G: (uint8)(44),
				B: (uint8)(0),
			}),
			Actor: (users.User)(users.User{
				UserSpec: (users.UserSpec)(users.UserSpec{
					ID:     (uint64)(45629),
					Domain: (string)("github.com"),
				}),
				Elsewhere: ([]users.UserSpec)(nil),
				Login:     (string)("davidlazar"),
				Name:      (string)(""),
				Email:     (string)(""),
				AvatarURL: (string)("https://avatars.githubusercontent.com/u/45629?s=36&v=3"),
				HTMLURL:   (string)("https://github.com/davidlazar"),
				CreatedAt: (time.Time)(time.Time{}),
				UpdatedAt: (time.Time)(time.Time{}),
				SiteAdmin: (bool)(false),
			}),
			UpdatedAt: (time.Time)(time.Date(1, 1, 1, 0, 0, 63621775009, 0, time.UTC).Add(passed)),
			HTMLURL:   (string)("https://github.com/nsf/gocode/issues/419#comment-277414645"),
		}),
		(notifications.Notification)(notifications.Notification{
			AppID: (string)("Issue"),
			RepoSpec: (notifications.RepoSpec)(notifications.RepoSpec{
				URI: (string)("github.com/robpike/ivy"),
			}),
			ThreadID: (uint64)(31),
			RepoURL:  (string)("https://github.com/robpike/ivy"),
			Title:    (string)("loop termination condition seems wrong"),
			Icon:     (notifications.OcticonID)("issue-opened"),
			Color: (notifications.RGB)(notifications.RGB{
				R: (uint8)(108),
				G: (uint8)(198),
				B: (uint8)(68),
			}),
			Actor: (users.User)(users.User{
				UserSpec: (users.UserSpec)(users.UserSpec{
					ID:     (uint64)(4324516),
					Domain: (string)("github.com"),
				}),
				Elsewhere: ([]users.UserSpec)(nil),
				Login:     (string)("robpike"),
				Name:      (string)(""),
				Email:     (string)(""),
				AvatarURL: (string)("https://avatars.githubusercontent.com/u/4324516?s=36&v=3"),
				HTMLURL:   (string)("https://github.com/robpike"),
				CreatedAt: (time.Time)(time.Time{}),
				UpdatedAt: (time.Time)(time.Time{}),
				SiteAdmin: (bool)(false),
			}),
			UpdatedAt: (time.Time)(time.Date(1, 1, 1, 0, 0, 63621763429, 0, time.UTC).Add(passed)),
			HTMLURL:   (string)("https://github.com/robpike/ivy/issues/31#comment-277396571"),
		}),
		(notifications.Notification)(notifications.Notification{
			AppID: (string)("PullRequest"),
			RepoSpec: (notifications.RepoSpec)(notifications.RepoSpec{
				URI: (string)("github.com/nsf/gocode"),
			}),
			ThreadID: (uint64)(417),
			RepoURL:  (string)("https://github.com/nsf/gocode"),
			Title:    (string)("[WIP] package_bin: support type alias"),
			Icon:     (notifications.OcticonID)("git-pull-request"),
			Color: (notifications.RGB)(notifications.RGB{
				R: (uint8)(108),
				G: (uint8)(198),
				B: (uint8)(68),
			}),
			Actor: (users.User)(users.User{
				UserSpec: (users.UserSpec)(users.UserSpec{
					ID:     (uint64)(12567),
					Domain: (string)("github.com"),
				}),
				Elsewhere: ([]users.UserSpec)(nil),
				Login:     (string)("nsf"),
				Name:      (string)(""),
				Email:     (string)(""),
				AvatarURL: (string)("https://avatars.githubusercontent.com/u/12567?s=36&v=3"),
				HTMLURL:   (string)("https://github.com/nsf"),
				CreatedAt: (time.Time)(time.Time{}),
				UpdatedAt: (time.Time)(time.Time{}),
				SiteAdmin: (bool)(false),
			}),
			UpdatedAt: (time.Time)(time.Date(1, 1, 1, 0, 0, 63621764131, 0, time.UTC).Add(passed)),
			HTMLURL:   (string)("https://github.com/nsf/gocode/pull/417#comment-277398182"),
		}),
		(notifications.Notification)(notifications.Notification{
			AppID: (string)("PullRequest"),
			RepoSpec: (notifications.RepoSpec)(notifications.RepoSpec{
				URI: (string)("github.com/google/go-github"),
			}),
			ThreadID: (uint64)(538),
			RepoURL:  (string)("https://github.com/google/go-github"),
			Title:    (string)("Added listing outside collaborators for an organization"),
			Icon:     (notifications.OcticonID)("git-pull-request"),
			Color: (notifications.RGB)(notifications.RGB{
				R: (uint8)(108),
				G: (uint8)(198),
				B: (uint8)(68),
			}),
			Actor: (users.User)(users.User{
				UserSpec: (users.UserSpec)(users.UserSpec{
					ID:     (uint64)(6598971),
					Domain: (string)("github.com"),
				}),
				Elsewhere: ([]users.UserSpec)(nil),
				Login:     (string)("gmlewis"),
				Name:      (string)(""),
				Email:     (string)(""),
				AvatarURL: (string)("https://avatars.githubusercontent.com/u/6598971?s=36&v=3"),
				HTMLURL:   (string)("https://github.com/gmlewis"),
				CreatedAt: (time.Time)(time.Time{}),
				UpdatedAt: (time.Time)(time.Time{}),
				SiteAdmin: (bool)(false),
			}),
			UpdatedAt: (time.Time)(time.Date(1, 1, 1, 0, 0, 63621757401, 0, time.UTC).Add(passed)),
			HTMLURL:   (string)("https://github.com/google/go-github/pull/538#comment-277378904"),
		}),
		(notifications.Notification)(notifications.Notification{
			AppID: (string)("Issue"),
			RepoSpec: (notifications.RepoSpec)(notifications.RepoSpec{
				URI: (string)("github.com/nsf/gocode"),
			}),
			ThreadID: (uint64)(396),
			RepoURL:  (string)("https://github.com/nsf/gocode"),
			Title:    (string)("PANIC!!! "),
			Icon:     (notifications.OcticonID)("issue-opened"),
			Color: (notifications.RGB)(notifications.RGB{
				R: (uint8)(108),
				G: (uint8)(198),
				B: (uint8)(68),
			}),
			Actor: (users.User)(users.User{
				UserSpec: (users.UserSpec)(users.UserSpec{
					ID:     (uint64)(8503),
					Domain: (string)("github.com"),
				}),
				Elsewhere: ([]users.UserSpec)(nil),
				Login:     (string)("samuel"),
				Name:      (string)(""),
				Email:     (string)(""),
				AvatarURL: (string)("https://avatars.githubusercontent.com/u/8503?s=36&v=3"),
				HTMLURL:   (string)("https://github.com/samuel"),
				CreatedAt: (time.Time)(time.Time{}),
				UpdatedAt: (time.Time)(time.Time{}),
				SiteAdmin: (bool)(false),
			}),
			UpdatedAt: (time.Time)(time.Date(1, 1, 1, 0, 0, 63621747822, 0, time.UTC).Add(passed)),
			HTMLURL:   (string)("https://github.com/nsf/gocode/issues/396#comment-277343192"),
		}),
		(notifications.Notification)(notifications.Notification{
			AppID: (string)("Issue"),
			RepoSpec: (notifications.RepoSpec)(notifications.RepoSpec{
				URI: (string)("github.com/primer/octicons"),
			}),
			ThreadID: (uint64)(154),
			RepoURL:  (string)("https://github.com/primer/octicons"),
			Title:    (string)("Please add more variants for refresh icon."),
			Icon:     (notifications.OcticonID)("issue-closed"),
			Color: (notifications.RGB)(notifications.RGB{
				R: (uint8)(189),
				G: (uint8)(44),
				B: (uint8)(0),
			}),
			Actor: (users.User)(users.User{
				UserSpec: (users.UserSpec)(users.UserSpec{
					ID:     (uint64)(11073943),
					Domain: (string)("github.com"),
				}),
				Elsewhere: ([]users.UserSpec)(nil),
				Login:     (string)("souravbadami"),
				Name:      (string)(""),
				Email:     (string)(""),
				AvatarURL: (string)("https://avatars.githubusercontent.com/u/11073943?s=36&v=3"),
				HTMLURL:   (string)("https://github.com/souravbadami"),
				CreatedAt: (time.Time)(time.Time{}),
				UpdatedAt: (time.Time)(time.Time{}),
				SiteAdmin: (bool)(false),
			}),
			UpdatedAt: (time.Time)(time.Date(1, 1, 1, 0, 0, 63621746110, 0, time.UTC).Add(passed)),
			HTMLURL:   (string)("https://github.com/primer/octicons/issues/154"),
		}),
		(notifications.Notification)(notifications.Notification{
			AppID: (string)("Issue"),
			RepoSpec: (notifications.RepoSpec)(notifications.RepoSpec{
				URI: (string)("github.com/primer/octicons"),
			}),
			ThreadID: (uint64)(78),
			RepoURL:  (string)("https://github.com/primer/octicons"),
			Title:    (string)("Add pause icon"),
			Icon:     (notifications.OcticonID)("issue-closed"),
			Color: (notifications.RGB)(notifications.RGB{
				R: (uint8)(189),
				G: (uint8)(44),
				B: (uint8)(0),
			}),
			Actor: (users.User)(users.User{
				UserSpec: (users.UserSpec)(users.UserSpec{
					ID:     (uint64)(6053067),
					Domain: (string)("github.com"),
				}),
				Elsewhere: ([]users.UserSpec)(nil),
				Login:     (string)("Odonno"),
				Name:      (string)(""),
				Email:     (string)(""),
				AvatarURL: (string)("https://avatars.githubusercontent.com/u/6053067?s=36&v=3"),
				HTMLURL:   (string)("https://github.com/Odonno"),
				CreatedAt: (time.Time)(time.Time{}),
				UpdatedAt: (time.Time)(time.Time{}),
				SiteAdmin: (bool)(false),
			}),
			UpdatedAt: (time.Time)(time.Date(1, 1, 1, 0, 0, 63621746061, 0, time.UTC).Add(passed)),
			HTMLURL:   (string)("https://github.com/primer/octicons/issues/78"),
		}),
		(notifications.Notification)(notifications.Notification{
			AppID: (string)("Issue"),
			RepoSpec: (notifications.RepoSpec)(notifications.RepoSpec{
				URI: (string)("github.com/neelance/graphql-go"),
			}),
			ThreadID: (uint64)(53),
			RepoURL:  (string)("https://github.com/neelance/graphql-go"),
			Title:    (string)("Opentracing not tracing graphql traces"),
			Icon:     (notifications.OcticonID)("issue-opened"),
			Color: (notifications.RGB)(notifications.RGB{
				R: (uint8)(108),
				G: (uint8)(198),
				B: (uint8)(68),
			}),
			Actor: (users.User)(users.User{
				UserSpec: (users.UserSpec)(users.UserSpec{
					ID:     (uint64)(1966521),
					Domain: (string)("github.com"),
				}),
				Elsewhere: ([]users.UserSpec)(nil),
				Login:     (string)("bsr203"),
				Name:      (string)(""),
				Email:     (string)(""),
				AvatarURL: (string)("https://avatars.githubusercontent.com/u/1966521?s=36&v=3"),
				HTMLURL:   (string)("https://github.com/bsr203"),
				CreatedAt: (time.Time)(time.Time{}),
				UpdatedAt: (time.Time)(time.Time{}),
				SiteAdmin: (bool)(false),
			}),
			UpdatedAt: (time.Time)(time.Date(1, 1, 1, 0, 0, 63621743050, 0, time.UTC).Add(passed)),
			HTMLURL:   (string)("https://github.com/neelance/graphql-go/issues/53#comment-277322972"),
		}),
	})
}()
