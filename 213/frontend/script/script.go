package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"

	"github.com/gopherjs/gopherjs/js"
	homecomponent "github.com/shurcooL/home/component"
	"github.com/shurcooL/home/http"
	"github.com/shurcooL/home/idiomaticgo"
	"github.com/shurcooL/htmlg"
	"github.com/shurcooL/issues"
	"github.com/shurcooL/notifications"
	notificationscomponent "github.com/shurcooL/notificationsapp/component"
	"github.com/shurcooL/notificationsapp/httpclient"
	"github.com/shurcooL/reactions"
	"github.com/shurcooL/resume"
	"github.com/shurcooL/users"
	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {
	switch readyState := document.ReadyState(); readyState {
	case "loading":
		document.AddEventListener("DOMContentLoaded", false, func(dom.Event) {
			go setup()
		})
	case "interactive", "complete":
		setup()
	default:
		panic(fmt.Errorf("internal error: unexpected document.ReadyState value: %v", readyState))
	}
}

var (
	reactionsService     reactions.Service
	notificationsService notifications.Service
	issuesService        issues.Service
	authenticatedUser    users.User
)

func setup() {
	fmt.Println("Started.")

	reactionsService = http.Reactions{}
	notificationsService = httpclient.NewNotifications(nil, "", "")
	issuesService = http.NewIssues("", "")
	var err error
	authenticatedUser, err = http.Users{}.GetAuthenticated(context.TODO())
	if err != nil {
		log.Println(err)
		authenticatedUser = users.User{} // THINK: Should it be a fatal error or not? What about on frontend vs backend?
	}

	fixupAnchors()

	dom.GetWindow().AddEventListener("popstate", false, func(dom.Event) {
		go renderBody(dom.GetWindow().Location().Pathname)
	})
}

func fixupAnchors() {
	for _, n := range document.QuerySelectorAll("header.header a") {
		a := n.(*dom.HTMLAnchorElement)
		switch a.Pathname {
		case "/idiomatic-go", "/resume", "/notifications":
			a.AddEventListener("click", false, anchor{a}.ClickHandler)
		}
	}
}

type anchor struct {
	*dom.HTMLAnchorElement
}

func (a anchor) ClickHandler(e dom.Event) {
	e.PreventDefault()

	if a.Pathname == dom.GetWindow().Location().Pathname {
		// Already there.
		fmt.Println("Already there.")
		return
	}

	// TODO: dom.GetWindow().History().PushState(...)
	js.Global.Get("window").Get("history").Call("pushState", nil, nil, a.Href) // TODO: Preserve query, hash? Maybe Href already contains some of that?

	go renderBody(a.Pathname)
}

func renderBody(page string) {
	returnURL := dom.GetWindow().Location().Pathname + dom.GetWindow().Location().Search
	var buf bytes.Buffer
	switch page {
	case "/resume":
		err := resume.RenderBodyInnerHTML(context.TODO(), &buf, reactionsService, notificationsService, authenticatedUser, returnURL)
		if err != nil {
			log.Println(err)
			return
		}
	case "/idiomatic-go":
		err := idiomaticgo.RenderBodyInnerHTML(context.TODO(), &buf, issuesService, notificationsService, authenticatedUser, returnURL)
		if err != nil {
			log.Println(err)
			return
		}
	case "/notifications":
		err := renderNotificationsBodyInnerHTML(context.TODO(), &buf, notificationsService, authenticatedUser, returnURL)
		if err != nil {
			log.Println(err)
			return
		}
	}
	document.Body().SetInnerHTML(buf.String())

	fixupAnchors()
}

func renderNotificationsBodyInnerHTML(ctx context.Context, w io.Writer, notificationsService notifications.Service, authenticatedUser users.User, returnURL string) error {
	var ns notifications.Notifications
	if authenticatedUser.ID != 0 {
		var err error
		ns, err = notificationsService.List(ctx, notifications.ListOptions{})
		if err != nil {
			return err
		}
	}

	_, err := io.WriteString(w, `<div style="max-width: 800px; margin: 0 auto 100px auto;">`)
	if err != nil {
		return err
	}

	// Render the header.
	header := homecomponent.Header{
		CurrentUser:       authenticatedUser,
		NotificationCount: uint64(len(ns)),
		ReturnURL:         returnURL,
	}
	err = htmlg.RenderComponents(w, header)
	if err != nil {
		return err
	}

	err = htmlg.RenderComponents(w, notificationscomponent.NotificationsByRepo{Notifications: ns})
	if err != nil {
		return err
	}

	_, err = io.WriteString(w, `</div>`)
	return err
}
