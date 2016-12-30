package main

import (
	"bytes"
	"context"
	"fmt"
	"log"

	"github.com/gopherjs/gopherjs/js"
	"github.com/shurcooL/home/http"
	"github.com/shurcooL/home/idiomaticgo"
	"github.com/shurcooL/issues"
	"github.com/shurcooL/notifications"
	"github.com/shurcooL/reactions"
	"github.com/shurcooL/resume"
	"github.com/shurcooL/users"
	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {
	switch readyState := document.ReadyState(); readyState {
	case "loading":
		document.AddEventListener("DOMContentLoaded", false, func(_ dom.Event) {
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
	notificationsService = http.Notifications{}
	issuesService = http.NewIssues("", "")
	var err error
	authenticatedUser, err = http.Users{}.GetAuthenticated(context.TODO())
	if err != nil {
		log.Println(err)
		authenticatedUser = users.User{} // THINK: Should it be a fatal error or not? What about on frontend vs backend?
	}

	fixupAnchors()
}

func fixupAnchors() {
	for _, n := range document.QuerySelectorAll("header.header .nav a") {
		a := n.(*dom.HTMLAnchorElement)
		switch a.Pathname {
		case "/idiomatic-go", "/resume":
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

	go renderBody(a.Pathname, a.Href)
}

func renderBody(page, href string) {
	switch page {
	case "/resume":
		var buf bytes.Buffer
		returnURL := dom.GetWindow().Location().Pathname + dom.GetWindow().Location().Search
		err := resume.RenderBodyInnerHTML(context.TODO(), &buf, reactionsService, notificationsService, authenticatedUser, returnURL)
		if err != nil {
			log.Println(err)
			return
		}
		document.Body().SetInnerHTML(buf.String())
	case "/idiomatic-go":
		var buf bytes.Buffer
		returnURL := dom.GetWindow().Location().Pathname + dom.GetWindow().Location().Search
		err := idiomaticgo.RenderBodyInnerHTML(context.TODO(), &buf, issuesService, notificationsService, authenticatedUser, returnURL)
		if err != nil {
			log.Println(err)
			return
		}
		document.Body().SetInnerHTML(buf.String())
	}

	fixupAnchors()

	// TODO: dom.GetWindow().History().PushState(...)
	js.Global.Get("window").Get("history").Call("pushState", nil, nil, href) // TODO: Preserve query, hash? Maybe Href already contains some of that?
}
