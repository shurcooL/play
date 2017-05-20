// Play with rendering a component, think about how it can be more accessible.
package main

import (
	"bytes"
	"fmt"
	"log"
	"time"

	"github.com/shurcooL/htmlg"
	"github.com/shurcooL/notifications"
	"github.com/shurcooL/notificationsapp/component"
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

func setup() {
	style := document.CreateElement("style").(*dom.HTMLStyleElement)
	style.SetAttribute("type", "text/css")
	style.SetTextContent(css)
	document.Head().AppendChild(style)

	c := component.RepoNotifications{
		Repo:    notifications.RepoSpec{URI: "dmitri.shuralyov.com/idiomatic-go"},
		RepoURL: "https://dmitri.shuralyov.com/idiomatic-go",
		Notifications: []component.Notification{{
			Notification: notifications.Notification{
				AppID:         "issues",
				RepoSpec:      notifications.RepoSpec{URI: "dmitri.shuralyov.com/idiomatic-go"},
				ThreadID:      4,
				RepoURL:       "https://example.org",
				Title:         "Avoid unused method receiver names",
				Icon:          notifications.OcticonID("issue-opened"),
				Color:         notifications.RGB{R: 108, G: 198, B: 68},
				Actor:         users.User{UserSpec: users.UserSpec{ID: 1924134, Domain: "github.com"}, Login: "shurcooL", AvatarURL: "https://avatars1.githubusercontent.com/u/1924134?s=36&v=3"},
				UpdatedAt:     time.Now().Add(-5 * time.Minute),
				HTMLURL:       "https://dmitri.shuralyov.com/issues/dmitri.shuralyov.com/idiomatic-go/4#comment-6",
				Participating: false,
			},
			Read: false,
		}},
	}

	var buf bytes.Buffer
	err := htmlg.RenderComponents(&buf, c)
	if err != nil {
		log.Println(err)
		return
	}
	document.Body().SetInnerHTML(buf.String())
}

const css = `
body {
	margin: 20px;
}
body, table {
	font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
	font-size: 14px;
	line-height: initial;
	color: #373a3c;
}

a.black {
	color: #373a3c;
	text-decoration: none;
}
a.black:hover {
	text-decoration: underline;
}

.tiny {
	font-size: 12px;
}

div.list-entry {
	margin-top: 12px;
	margin-bottom: 24px;
}
div.list-entry-border {
	border: 1px solid #ddd;
	border-radius: 4px;
}
div.list-entry-header {
	font-size: 14px;
	background-color: #f8f8f8;
	padding: 10px;
	border-radius: 4px 4px 0 0;
	border-bottom: 1px solid #eee;
}
div.list-entry-body {
	padding: 10px;
}
div.multilist-entry:not(:nth-child(0n+2)) {
	border: 0px solid #ddd;
	border-top-width: 1px;
}

.read .gray-when-read {
	color: #bbb !important;
}
.read .fade-when-read {
	opacity: 0.25;
}
.read .hide-when-read {
	visibility: hidden;
}

.content td {
	padding: 0;
}
span.content {
	display: table-cell;
	width: 100%;
}
span.right-icon {
	display: table-cell;
	vertical-align: middle;
	padding-left: 12px;
	padding-right: 4px;
}
span.right-icon a {
	color: #bbb;
}
span.right-icon a:hover {
	color: black;
}

img.avatar {
	border-radius: 2px;
	width: 18px;
	height: 18px;
	vertical-align: text-top;
	margin-right: 10px;
}
`
