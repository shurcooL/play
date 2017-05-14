// Work on an activity visualization page.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/dustin/go-humanize"
	"github.com/google/go-github/github"
	"github.com/shurcooL/github_flavored_markdown"
	"github.com/shurcooL/home/httputil"
	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
)

func run() error {
	http.HandleFunc("/index.html", httputil.ErrorHandler(func(w http.ResponseWriter, req *http.Request) error {
		// https://godoc.org/github.com/google/go-github/github#ActivityService.ListEventsPerformedByUser
		events, _, err := ListEventsPerformedByUser("shurcooL", true, &github.ListOptions{PerPage: 100})
		if err != nil {
			return err
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		activity := activity{events: events}
		err = htmlg.RenderComponents(w, activity)
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

type activity struct {
	events []*github.Event
}

func (a activity) Render() []*html.Node {
	var nodes []*html.Node

	for _, e := range a.events {
		nodes = append(nodes,
			htmlg.H3(htmlg.Text(fmt.Sprintf("%v - %v", *e.Type, humanize.Time(*e.CreatedAt)))),
		)

		switch p := e.Payload().(type) {
		case *github.IssuesEvent:
			nodes = append(nodes,
				htmlg.H4(htmlg.Text(fmt.Sprintf("%v %v issue ", *e.Actor.Login, *p.Action)), htmlg.A(*p.Issue.Title, *p.Issue.HTMLURL), htmlg.Text(fmt.Sprintf(" in %v", *e.Repo.Name))),
			)
			if *p.Action == "opened" {
				body := string(github_flavored_markdown.Markdown([]byte(*p.Issue.Body)))
				nodes = append(nodes,
					htmlg.P(parseNodes(body)...),
				)
			}

		case *github.IssueCommentEvent:
			nodes = append(nodes,
				htmlg.H4(htmlg.Text(fmt.Sprintf("%v commented on issue ", *e.Actor.Login)), htmlg.A(*p.Issue.Title, *p.Issue.HTMLURL), htmlg.Text(fmt.Sprintf(" in %v", *e.Repo.Name))),
			)
			body := string(github_flavored_markdown.Markdown([]byte(*p.Comment.Body)))
			nodes = append(nodes,
				htmlg.P(parseNodes(body)...),
				htmlg.P(htmlg.A("source", *p.Comment.HTMLURL)),
			)
		case *github.CommitCommentEvent:
			nodes = append(nodes,
				htmlg.H4(htmlg.Text(fmt.Sprintf("%v commented on %v", *e.Actor.Login, *e.Repo.Name))),
			)
			body := string(github_flavored_markdown.Markdown([]byte(*p.Comment.Body)))
			nodes = append(nodes,
				htmlg.P(parseNodes(body)...),
				htmlg.P(htmlg.A("source", *p.Comment.HTMLURL)),
			)
		case *github.PullRequestReviewCommentEvent:
			nodes = append(nodes,
				htmlg.H4(htmlg.Text(fmt.Sprintf("%v commented on %v", *e.Actor.Login, *e.Repo.Name))),
			)
			body := string(github_flavored_markdown.Markdown([]byte(*p.Comment.Body)))
			nodes = append(nodes,
				htmlg.P(parseNodes(body)...),
				htmlg.P(htmlg.A("source", *p.Comment.HTMLURL)),
			)

		case *github.PushEvent:
			nodes = append(nodes,
				htmlg.H4(htmlg.Text(fmt.Sprintf("%v pushed to %v", *e.Actor.Login, *e.Repo.Name))),
			)

		case *github.WatchEvent:
			nodes = append(nodes,
				htmlg.H4(htmlg.Text(fmt.Sprintf("%v starred %v", *e.Actor.Login, *e.Repo.Name))),
			)

		case *github.DeleteEvent:
			nodes = append(nodes,
				htmlg.H4(htmlg.Text(fmt.Sprintf("%v deleted %v %v in %v", *e.Actor.Login, *p.RefType, *p.Ref, *e.Repo.Name))),
			)
		}
	}

	return nodes
}

// TODO: Finish shaping this abstraction up, and use it.
type event struct {
	Actor     string
	Verb      string
	TargetURL string
	Time      time.Time
}

func (e event) Render() []*html.Node {
	var nodes []*html.Node
	nodes = append(nodes,
		htmlg.H4(
			htmlg.Text(e.Actor),
			htmlg.Text(" "),
			htmlg.Text(e.Verb),
			htmlg.Text(" in "),
			htmlg.A(e.TargetURL, "https://"+e.TargetURL),
			htmlg.Text(" at "),
			htmlg.Text(humanize.Time(e.Time)),
		),
	)
	return nodes
}

func parseNodes(s string) (nodes []*html.Node) {
	e, err := html.ParseFragment(strings.NewReader(s), nil)
	if err != nil {
		panic(fmt.Errorf("internal error: html.ParseFragment failed: %v", err))
	}
	for {
		n := e[0].LastChild.FirstChild
		if n == nil {
			break
		}
		n.Parent.RemoveChild(n)
		nodes = append(nodes, n)
	}
	return nodes
}

func ListEventsPerformedByUser(user string, publicOnly bool, opt *github.ListOptions) ([]*github.Event, *github.Response, error) {
	var events []*github.Event
	err := json.NewDecoder(strings.NewReader(sampleEventsData)).Decode(&events)
	return events, nil, err
}

/*
{{define "CommentEvent"}}
	<p>{{.payload.comment.body}}</p>
	<p><a href={{.payload.comment.html_url}}>source</a></p>
{{end}}

{{define "PushEvent"}}
	<p>{{.actor.display_login}} pushed to {{.repo.name}}</p>
	<p>{{(index .payload.commits 0).message}}</p>
{{end}}

{{define "IssuesEvent"}}
	<p>{{.actor.display_login}} {{.payload.action}} issue {{.payload.issue.title}} in {{.repo.name}}</p>
	{{if eq .payload.action "opened"}}<p>{{.payload.issue.body}}</p>{{end}}
{{end}}

<html>
	<head>
	</head>
	<body>
		<h1>Activity</h1>
		{{range .}}
			<h3>{{.type}}</h3>
			{{if or (eq .type "IssueCommentEvent") (eq .type "PullRequestReviewCommentEvent")}}
				{{template "CommentEvent" .}}
			{{else if eq .type "PushEvent"}}
				{{template "PushEvent" .}}
			{{else if eq .type "IssuesEvent"}}
				{{template "IssuesEvent" .}}
			{{end}}
		{{end}}
	</body>
</html>
*/
