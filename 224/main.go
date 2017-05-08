// Play with events/fs service (fs store implementation).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

	"github.com/google/go-github/github"
	"github.com/shurcooL/events/event"
	"github.com/shurcooL/events/fs"
	"github.com/shurcooL/users"
	"golang.org/x/net/webdav"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	eventsService, err := fs.NewService(
		webdav.Dir(filepath.Join(os.Getenv("HOME"), "Dropbox", "Store", "events")),
		users.UserSpec{ID: 1924134, Domain: "github.com"},
	)
	if err != nil {
		return err
	}
	if c, ok := eventsService.(io.Closer); ok {
		defer c.Close()
	}

	var events []*github.Event
	err = json.Unmarshal([]byte(eventsJSON), &events)
	if err != nil {
		panic(err)
	}
	for _, event := range convert(events, nil) {
		//event.Event{
		//	Time:      time.Now().UTC(),
		//	Actor:     users.User{UserSpec: users.UserSpec{ID: 123, Domain: "example.com"}, Login: "gopher"},
		//	Container: "example.com/foo/bar",
		//}
		err = eventsService.Log(context.Background(), event)
		if err != nil {
			return err
		}
	}

	es, err := eventsService.List(context.Background())
	if err != nil {
		return err
	}
	//fmt.Printf("%+v\n", es)
	fmt.Println("len:", len(es))

	return nil
}

// convert converts GitHub events. commits key is SHA.
func convert(events []*github.Event, commits map[string]*github.RepositoryCommit) []event.Event {
	var es []event.Event
	for _, e := range events {
		ee := event.Event{
			Time: *e.CreatedAt,
			Actor: users.User{
				UserSpec: users.UserSpec{ID: uint64(*e.Actor.ID), Domain: "github.com"},
				Login:    *e.Actor.Login,
			},
			Container: "github.com/" + *e.Repo.Name,
		}

		switch p := e.Payload().(type) {
		case *github.IssuesEvent:
			switch *p.Action {
			case "opened", "closed", "reopened":

				//default:
				//log.Println("convert: unsupported *github.IssuesEvent action:", *p.Action)
			}
			ee.Payload = event.Issue{
				Action:       *p.Action,
				IssueTitle:   *p.Issue.Title,
				IssueHTMLURL: *p.Issue.HTMLURL,
			}
		case *github.PullRequestEvent:
			var action string
			switch {
			case !*p.PullRequest.Merged && *p.PullRequest.State == "open":
				action = "opened"
			case !*p.PullRequest.Merged && *p.PullRequest.State == "closed":
				action = "closed"
			case *p.PullRequest.Merged:
				action = "merged"

				//default:
				//log.Println("convert: unsupported *github.PullRequestEvent PullRequest.State:", *p.PullRequest.State, "PullRequest.Merged:", *p.PullRequest.Merged)
			}
			ee.Payload = event.PullRequest{
				Action:             action,
				PullRequestTitle:   *p.PullRequest.Title,
				PullRequestHTMLURL: *p.PullRequest.HTMLURL,
			}

		case *github.IssueCommentEvent:
			switch p.Issue.PullRequestLinks {
			case nil: // Issue.
				switch *p.Action {
				case "created":
					ee.Payload = event.IssueComment{
						IssueTitle:           *p.Issue.Title,
						IssueState:           *p.Issue.State, // TODO: Verify "open", "closed"?
						CommentBody:          *p.Comment.Body,
						CommentUserAvatarURL: *p.Comment.User.AvatarURL,
						CommentHTMLURL:       *p.Comment.HTMLURL,
					}

					//default:
					//e.WIP = true
					//e.Action = component.Text(fmt.Sprintf("%v on an issue in", *p.Action))
				}
			default: // Pull Request.
				switch *p.Action {
				case "created":
					ee.Payload = event.PullRequestComment{
						PullRequestTitle: *p.Issue.Title,
						// TODO: Detect "merged" state somehow? It's likely going to require making an API call.
						PullRequestState:     *p.Issue.State, // TODO: Verify "open", "closed"?
						CommentBody:          *p.Comment.Body,
						CommentUserAvatarURL: *p.Comment.User.AvatarURL,
						CommentHTMLURL:       *p.Comment.HTMLURL,
					}

					//default:
					//e.WIP = true
					//e.Action = component.Text(fmt.Sprintf("%v on a pull request in", *p.Action))
				}
			}
		case *github.PullRequestReviewCommentEvent:
			switch *p.Action {
			case "created":
				var state string
				switch {
				case p.PullRequest.MergedAt == nil && *p.PullRequest.State == "open":
					state = "open"
				case p.PullRequest.MergedAt == nil && *p.PullRequest.State == "closed":
					state = "closed"
				case p.PullRequest.MergedAt != nil:
					state = "merged"

					//default:
					//log.Println("convert: unsupported *github.PullRequestReviewCommentEvent PullRequest.State:", *p.PullRequest.State)
				}

				ee.Payload = event.PullRequestComment{
					PullRequestTitle:     *p.PullRequest.Title,
					PullRequestState:     state,
					CommentBody:          *p.Comment.Body,
					CommentUserAvatarURL: *p.Comment.User.AvatarURL,
					CommentHTMLURL:       *p.Comment.HTMLURL,
				}

				//default:
				//basicEvent.WIP = true
				//e.Action = component.Text(fmt.Sprintf("%v on a pull request in", *p.Action))
			}
		case *github.CommitCommentEvent:
			var commit event.Commit
			if c := commits[*p.Comment.CommitID]; c != nil {
				commit = event.Commit{
					SHA:             *c.SHA,
					CommitMessage:   *c.Commit.Message,
					AuthorAvatarURL: *c.Author.AvatarURL,
					HTMLURL:         *c.HTMLURL,
				}
			}
			// THINK: Is it worth to include partial information, if all we have is commit ID?
			//} else {
			//	commit = event.Commit{
			//		SHA: *p.Comment.CommitID,
			//	}
			//}
			ee.Payload = event.CommitComment{
				Commit:               commit,
				CommentBody:          *p.Comment.Body,
				CommentUserAvatarURL: *p.Comment.User.AvatarURL,
			}

		case *github.PushEvent:
			var cs []event.Commit
			for _, c := range p.Commits {
				commit := commits[*c.SHA]
				if commit == nil {
					avatarURL := "https://secure.gravatar.com/avatar?d=mm&f=y&s=96"
					if *c.Author.Email == "shurcooL@gmail.com" {
						// TODO: Can we de-dup this in a good way? It's in users service.
						avatarURL = "https://dmitri.shuralyov.com/avatar-s.jpg"
					}
					cs = append(cs, event.Commit{
						SHA:             *c.SHA,
						CommitMessage:   *c.Message,
						AuthorAvatarURL: avatarURL,
					})
					continue
				}
				cs = append(cs, event.Commit{
					SHA:             *commit.SHA,
					CommitMessage:   *commit.Commit.Message,
					AuthorAvatarURL: *commit.Author.AvatarURL,
					HTMLURL:         *commit.HTMLURL,
				})
			}

			ee.Payload = event.Push{
				Commits: cs,
			}

		case *github.WatchEvent:
			ee.Payload = event.Star{}

		case *github.CreateEvent:
			switch *p.RefType {
			case "repository":
				ee.Payload = event.Create{
					Type:        "repository",
					Description: *p.Description,
				}
			case "branch", "tag":
				ee.Payload = event.Create{
					Type: *p.RefType,
					Name: *p.Ref,
				}

				//default:
				//basicEvent.WIP = true
				//e.Action = component.Text(fmt.Sprintf("created %v in", *p.RefType))
				//e.Details = code{
				//	Text: *p.Ref,
				//}
			}
		case *github.ForkEvent:
			ee.Payload = event.Fork{
				Container: "github.com/" + *p.Forkee.FullName,
			}
		case *github.DeleteEvent:
			ee.Payload = event.Delete{
				Type: *p.RefType, // TODO: Verify *p.RefType?
				Name: *p.Ref,
			}

		case *github.GollumEvent:
			var pages []event.Page
			for _, p := range p.Pages {
				pages = append(pages, event.Page{
					Action:         *p.Action,
					Title:          *p.Title,
					PageHTMLURL:    "https://github.com" + *p.HTMLURL,
					CompareHTMLURL: "https://github.com" + *p.HTMLURL + "/_compare/" + *p.SHA + "^..." + *p.SHA,
				})
			}
			ee.Payload = event.Gollum{
				ActorAvatarURL: *e.Actor.AvatarURL,
				Pages:          pages,
			}
		}

		es = append(es, ee)
	}
	return es
}

const eventsJSON = `[
  {
    "id": "5825549836",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 63837032,
      "name": "shurcooL/httpgzip",
      "url": "https://api.github.com/repos/shurcooL/httpgzip"
    },
    "payload": {
      "push_id": 1724699651,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "70ac4ed6deae17bdf4b79a851ae1146557f8162c",
      "before": "cda3a378aec1d07808838579df61bb0dd2aa7873",
      "commits": [
        {
          "sha": "70ac4ed6deae17bdf4b79a851ae1146557f8162c",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Improve consistency of HTTP error messages.\n\nString concatenation ends up being simpler than using fmt.Sprintf in\nthis case.\n\nInclude \"405 Method Not Allowed\\n\\n\" prefix in fileServer.ServeHTTP\nlike for other error messages.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/httpgzip/commits/70ac4ed6deae17bdf4b79a851ae1146557f8162c"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-07T22:24:56Z"
  },
  {
    "id": "5825428092",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 14737022,
      "name": "shurcooL/gostatus",
      "url": "https://api.github.com/repos/shurcooL/gostatus"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/shurcooL/gostatus/issues/42",
        "repository_url": "https://api.github.com/repos/shurcooL/gostatus",
        "labels_url": "https://api.github.com/repos/shurcooL/gostatus/issues/42/labels{/name}",
        "comments_url": "https://api.github.com/repos/shurcooL/gostatus/issues/42/comments",
        "events_url": "https://api.github.com/repos/shurcooL/gostatus/issues/42/events",
        "html_url": "https://github.com/shurcooL/gostatus/issues/42",
        "id": 226772561,
        "number": 42,
        "title": "handle version tag",
        "user": {
          "login": "mh-cbon",
          "id": 17096799,
          "avatar_url": "https://avatars0.githubusercontent.com/u/17096799?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/mh-cbon",
          "html_url": "https://github.com/mh-cbon",
          "followers_url": "https://api.github.com/users/mh-cbon/followers",
          "following_url": "https://api.github.com/users/mh-cbon/following{/other_user}",
          "gists_url": "https://api.github.com/users/mh-cbon/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/mh-cbon/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/mh-cbon/subscriptions",
          "organizations_url": "https://api.github.com/users/mh-cbon/orgs",
          "repos_url": "https://api.github.com/users/mh-cbon/repos",
          "events_url": "https://api.github.com/users/mh-cbon/events{/privacy}",
          "received_events_url": "https://api.github.com/users/mh-cbon/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 3,
        "created_at": "2017-05-06T13:51:03Z",
        "updated_at": "2017-05-07T21:22:04Z",
        "closed_at": null,
        "body": "Hi,\r\n\r\nI d like very much it also handles tags \r\nto detect repository that are currently in \r\nRC state such as beta / alpha, \r\nso that i can have better overview of which repo has pending release.\r\n\r\nAs example i have this repo here (https://github.com/mh-cbon/emd/releases)\r\nwith pending release for +10 days, likely i will forget about it if i m into some rush.\r\n\r\nWould a patch using Masterminds/semver suitable for you ?"
      },
      "comment": {
        "url": "https://api.github.com/repos/shurcooL/gostatus/issues/comments/299735861",
        "html_url": "https://github.com/shurcooL/gostatus/issues/42#issuecomment-299735861",
        "issue_url": "https://api.github.com/repos/shurcooL/gostatus/issues/42",
        "id": 299735861,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-07T21:22:04Z",
        "updated_at": "2017-05-07T21:22:04Z",
        "body": "I see, thanks for elaborating.\r\n\r\n> Desired output is not extraordinary,\r\n>\r\n> ` + "```" + `sh\r\n> $ gostatus all\r\n>   +  github.com/dchest/uniuri/...\r\n> \t+ Pending RC\r\n> ` + "```" + `\r\n>\r\n> or similar.\r\n\r\nThe + symbol is currently used to display when the remote has newer commits that your local repo doesn't have. The - symbol is used to display when the local repo has unpushed commits that the remote doesn't have. So, a minus symbol would be more logical than a plus. However, I'm not sure if it's a good idea to reuse an existing symbol for different things. Unless you want to combine it somehow.\r\n\r\n### Next Steps\r\n\r\nOne of my biggest concerns with a change like this is whether or not it's general. I want the status properties that ` + "`" + `gostatus` + "`" + ` returns to be general and applicable to all users. It should be as if it's one of the standard ` + "`" + `go get` + "`" + `, ` + "`" + `go install` + "`" + `, ` + "`" + `go test` + "`" + ` commands.\r\n\r\nI currently rely heavily on ` + "`" + `gostatus` + "`" + ` to tell me which of my projects are a work in progress or in an unclean state. I don't actively use tags. So, as I understand, the output of ` + "`" + `gostatus -c all` + "`" + ` would change from displaying only a few unclean repos to display all repos, which would be highly undesirable. We could try to hide it behind a flag, but that adds complexity.\r\n\r\nSince you know best about what you want out of this feature, I think the best way to move forward is for you to fork gostatus and implement the feature, as you'd like to see it, in your fork.\r\n\r\nThen, you're welcome to use your fork for your needs. Once this feature is ready and if you feel it's general enough that it can belong in my fork, then we can discuss potentially merging it upstream.\r\n\r\nDoes that sound reasonable?"
      }
    },
    "public": true,
    "created_at": "2017-05-07T21:22:04Z"
  },
  {
    "id": "5825363741",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 12418999,
      "name": "gopherjs/gopherjs",
      "url": "https://api.github.com/repos/gopherjs/gopherjs"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/gopherjs/gopherjs/issues/275",
        "repository_url": "https://api.github.com/repos/gopherjs/gopherjs",
        "labels_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/275/labels{/name}",
        "comments_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/275/comments",
        "events_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/275/events",
        "html_url": "https://github.com/gopherjs/gopherjs/issues/275",
        "id": 102553303,
        "number": 275,
        "title": "*js.Error and *js.Object treating null objects differently",
        "user": {
          "login": "flimzy",
          "id": 8555063,
          "avatar_url": "https://avatars3.githubusercontent.com/u/8555063?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/flimzy",
          "html_url": "https://github.com/flimzy",
          "followers_url": "https://api.github.com/users/flimzy/followers",
          "following_url": "https://api.github.com/users/flimzy/following{/other_user}",
          "gists_url": "https://api.github.com/users/flimzy/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/flimzy/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/flimzy/subscriptions",
          "organizations_url": "https://api.github.com/users/flimzy/orgs",
          "repos_url": "https://api.github.com/users/flimzy/repos",
          "events_url": "https://api.github.com/users/flimzy/events{/privacy}",
          "received_events_url": "https://api.github.com/users/flimzy/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 6,
        "created_at": "2015-08-22T17:35:22Z",
        "updated_at": "2017-05-07T20:50:00Z",
        "closed_at": null,
        "body": "I originally asked about this on the [Google Group](https://groups.google.com/forum/#!topic/gopherjs/oZDOuUCK_PM), but GH seems to be more active, so I'm re-posting here (plus markdown!!)\n\nI'm not sure if I've run into a bug, or if I'm misusing GopherJS, but I've run into a problem with the way my Go code receives errors passed by Javascript Callbacks.  To demonstrate the problem, I've built this code:\n\nMy main.js:\n\n` + "```" + `\nwindow.foo = {\n    nothing: function(cb) {\n        return cb(null);\n    }\n}\nrequire('main');\n` + "```" + `\n\nAnd main.go:\n\n` + "```" + `\npackage main\n\nimport (\n    \"github.com/gopherjs/gopherjs/js\"\n    \"honnef.co/go/js/console\"\n)\n\nfunc main() {\n    result := nothing()\n    console.Log(result)\n    if result == nil {\n        console.Log(\"result is nil\")\n    }\n    if result != nil {\n        console.Log(\"result is not nil\")\n    }\n}\n\nfunc nothing() *js.Error {\n    c := make(chan *js.Error)\n    go func() {\n        js.Global.Get(\"foo\").Call(\"nothing\",func(err *js.Error) {\n            c <- err\n        })\n    }()\n    return <-c\n}\n` + "```" + `\n\nThe output on my javascript console (in Chrome 43, FWIW) is:\n\n> null  \n> result is not nil\n\nIf I do a ` + "`" + `s/*js.Error/*js.Object/` + "`" + ` in main.go, I get the expected result:\n\n> null  \n> result is nil\n\nSo it seems that somehow the Error struct around *js.Object is obfuscating the nullness of the javascript object?  Am I doing this wrong?\n"
      },
      "comment": {
        "url": "https://api.github.com/repos/gopherjs/gopherjs/issues/comments/299733737",
        "html_url": "https://github.com/gopherjs/gopherjs/issues/275#issuecomment-299733737",
        "issue_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/275",
        "id": 299733737,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-07T20:50:00Z",
        "updated_at": "2017-05-07T20:50:00Z",
        "body": "> However, we may want to reconsider what happens when ` + "`" + `null` + "`" + ` gets internalized to such a pointer to a struct. @shurcooL @dominikh Do you think it makes sense to internalize to ` + "`" + `nil` + "`" + ` instead of synthesizing a struct and then put ` + "`" + `nil` + "`" + ` into the ` + "`" + `*js.Object` + "`" + ` field?\r\n\r\nThat makes sense to me. Sorry, didn't see this question earlier."
      }
    },
    "public": true,
    "created_at": "2017-05-07T20:50:00Z",
    "org": {
      "id": 6654647,
      "login": "gopherjs",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/gopherjs",
      "avatar_url": "https://avatars.githubusercontent.com/u/6654647?"
    }
  },
  {
    "id": "5825332477",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10270722,
      "name": "google/go-github",
      "url": "https://api.github.com/repos/google/go-github"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/google/go-github/issues/633",
        "repository_url": "https://api.github.com/repos/google/go-github",
        "labels_url": "https://api.github.com/repos/google/go-github/issues/633/labels{/name}",
        "comments_url": "https://api.github.com/repos/google/go-github/issues/633/comments",
        "events_url": "https://api.github.com/repos/google/go-github/issues/633/events",
        "html_url": "https://github.com/google/go-github/pull/633",
        "id": 226869014,
        "number": 633,
        "title": "Add OnRequest + OnResponse hooks",
        "user": {
          "login": "radeksimko",
          "id": 287584,
          "avatar_url": "https://avatars2.githubusercontent.com/u/287584?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/radeksimko",
          "html_url": "https://github.com/radeksimko",
          "followers_url": "https://api.github.com/users/radeksimko/followers",
          "following_url": "https://api.github.com/users/radeksimko/following{/other_user}",
          "gists_url": "https://api.github.com/users/radeksimko/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/radeksimko/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/radeksimko/subscriptions",
          "organizations_url": "https://api.github.com/users/radeksimko/orgs",
          "repos_url": "https://api.github.com/users/radeksimko/repos",
          "events_url": "https://api.github.com/users/radeksimko/events{/privacy}",
          "received_events_url": "https://api.github.com/users/radeksimko/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 0,
        "created_at": "2017-05-07T15:33:44Z",
        "updated_at": "2017-05-07T20:34:26Z",
        "closed_at": null,
        "pull_request": {
          "url": "https://api.github.com/repos/google/go-github/pulls/633",
          "html_url": "https://github.com/google/go-github/pull/633",
          "diff_url": "https://github.com/google/go-github/pull/633.diff",
          "patch_url": "https://github.com/google/go-github/pull/633.patch"
        },
        "body": "I was unable to find a way to debug the communication between Github and the client and server, which is something we'd find extremely useful in [Terraform](https://github.com/hashicorp/terraform), especially when our nightly acceptance tests fail because of what appears to be eventual consistency.\r\n\r\nThe only way to debug such issues without this patch from my point of view is either:\r\n\r\n1. tcpdump + some kind of MITM proxy (because all traffic is encrypted), or\r\n2. capture _every single_ request and response from each call, e.g. from ` + "`" + `activitySvc.ListFeeds(ctx)` + "`" + ` which would involve a lot of duplicated logic in many places (esp. in the case of Terraform) assuming we want to capture all requests and responses.\r\n\r\nWe've been able to debug various issues with a very similar pattern that is already part of AWS Go SDK, but I'm open to alternative solutions/suggestions to solve that problem."
      },
      "comment": {
        "url": "https://api.github.com/repos/google/go-github/issues/comments/299732665",
        "html_url": "https://github.com/google/go-github/pull/633#issuecomment-299732665",
        "issue_url": "https://api.github.com/repos/google/go-github/issues/633",
        "id": 299732665,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-07T20:34:26Z",
        "updated_at": "2017-05-07T20:34:26Z",
        "body": "> We've been able to debug various issues with a very similar pattern that is already part of AWS Go SDK, but I'm open to alternative solutions/suggestions to solve that problem.\r\n\r\nHave you considered a logging ` + "`" + `http.RoundTripper` + "`" + ` middleware? As far as I know, that's the most general way these things are done. As long as there's a way to specify the ` + "`" + `*http.Client` + "`" + ` being used, which there is, you can pass a custom ` + "`" + `*http.Client` + "`" + `, or modify the current one being passed to include an ` + "`" + `http.RoundTripper` + "`" + ` that performs the ` + "`" + `OnRequest` + "`" + ` and ` + "`" + `OnResponse` + "`" + ` you want.\r\n\r\nHow does that sound to you?"
      }
    },
    "public": true,
    "created_at": "2017-05-07T20:34:26Z",
    "org": {
      "id": 1342004,
      "login": "google",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/google",
      "avatar_url": "https://avatars.githubusercontent.com/u/1342004?"
    }
  },
  {
    "id": "5825307580",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10270722,
      "name": "google/go-github",
      "url": "https://api.github.com/repos/google/go-github"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/google/go-github/pulls/comments/115152963",
        "pull_request_review_id": 36672565,
        "id": 115152963,
        "diff_hunk": "@@ -0,0 +1,35 @@\n+// Copyright 2017 The go-github AUTHORS. All rights reserved.\n+//\n+// Use of this source code is governed by a BSD-style\n+// license that can be found in the LICENSE file.\n+\n+package github\n+\n+import (\n+\t\"context\"\n+\t\"fmt\"\n+\t\"net/http\"\n+\t\"reflect\"\n+\t\"testing\"\n+)\n+\n+func TestRepositoriesService_GetCommunityHealthMetrics(t *testing.T) {\n+\tsetup()\n+\tdefer teardown()\n+\n+\tmux.HandleFunc(\"/repos/o/r/community/profile\", func(w http.ResponseWriter, r *http.Request) {\n+\t\ttestMethod(t, r, \"GET\")\n+\t\ttestHeader(t, r, \"Accept\", mediaTypeRepositoryCommunityHealthMetricsPreview)\n+\t\tfmt.Fprintf(w, ` + "`" + `{\"health_percentage\":75}` + "`" + `)",
        "path": "github/repos_community_health_test.go",
        "position": 23,
        "original_position": 23,
        "commit_id": "16e47d3aea527dc9d49de5e150953f802422450e",
        "original_commit_id": "16e47d3aea527dc9d49de5e150953f802422450e",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "Perhaps it's a good idea to make this test have higher coverage. You can use the entire sample response from https://developer.github.com/v3/repos/community/#retrieve-community-health-metrics:\r\n\r\n` + "```" + `JSON\r\n{\r\n  \"health_percentage\": 100,\r\n  \"files\": {\r\n    \"code_of_conduct\": {\r\n      \"name\": \"Contributor Covenant\",\r\n      \"key\": \"contributor_covenant\",\r\n      \"url\": null,\r\n      \"html_url\": \"https://github.com/octocat/Hello-World` + "`" + `/blob/master/CODE_OF_CONDUCT.md\"\r\n    },\r\n    \"contributing\": {\r\n      \"url\": \"https://api.github.com/repos/octocat/Hello-World/contents/CONTRIBUTING\",\r\n      \"html_url\": \"https://github.com/octocat/Hello-World/blob/master/CONTRIBUTING\"\r\n    },\r\n    \"license\": {\r\n      \"name\": \"MIT License\",\r\n      \"key\": \"mit\",\r\n      \"url\": \"https://api.github.com/licenses/mit\",\r\n      \"html_url\": \"https://github.com/octocat/Hello-World/blob/master/LICENSE\"\r\n    },\r\n    \"readme\": {\r\n      \"url\": \"https://api.github.com/repos/octocat/Hello-World/contents/README.md\",\r\n      \"html_url\": \"https://github.com/octocat/Hello-World/blob/master/README.md\"\r\n    }\r\n  },\r\n  \"updated_at\": \"2017-02-28T19:09:29Z\"\r\n}\r\n` + "```" + `",
        "created_at": "2017-05-07T20:22:06Z",
        "updated_at": "2017-05-07T20:22:13Z",
        "html_url": "https://github.com/google/go-github/pull/628#discussion_r115152963",
        "pull_request_url": "https://api.github.com/repos/google/go-github/pulls/628",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments/115152963"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/628#discussion_r115152963"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/google/go-github/pulls/628",
        "id": 119070615,
        "html_url": "https://github.com/google/go-github/pull/628",
        "diff_url": "https://github.com/google/go-github/pull/628.diff",
        "patch_url": "https://github.com/google/go-github/pull/628.patch",
        "issue_url": "https://api.github.com/repos/google/go-github/issues/628",
        "number": 628,
        "state": "open",
        "locked": false,
        "title": "Add Community Health metrics endpoint",
        "user": {
          "login": "sahildua2305",
          "id": 5206277,
          "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/sahildua2305",
          "html_url": "https://github.com/sahildua2305",
          "followers_url": "https://api.github.com/users/sahildua2305/followers",
          "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
          "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
          "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
          "repos_url": "https://api.github.com/users/sahildua2305/repos",
          "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
          "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "This is a new API released by GitHub and is currently available as a\r\npreview only.\r\nLink - https://developer.github.com/v3/repos/community/#retrieve-community-health-metrics\r\n\r\nFixes: #553",
        "created_at": "2017-05-04T21:28:15Z",
        "updated_at": "2017-05-07T20:22:13Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "1e352e75242ce8cbab2443614eab938dec7d64c7",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/google/go-github/pulls/628/commits",
        "review_comments_url": "https://api.github.com/repos/google/go-github/pulls/628/comments",
        "review_comment_url": "https://api.github.com/repos/google/go-github/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/google/go-github/issues/628/comments",
        "statuses_url": "https://api.github.com/repos/google/go-github/statuses/16e47d3aea527dc9d49de5e150953f802422450e",
        "head": {
          "label": "sahildua2305:add-community-health",
          "ref": "add-community-health",
          "sha": "16e47d3aea527dc9d49de5e150953f802422450e",
          "user": {
            "login": "sahildua2305",
            "id": 5206277,
            "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/sahildua2305",
            "html_url": "https://github.com/sahildua2305",
            "followers_url": "https://api.github.com/users/sahildua2305/followers",
            "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
            "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
            "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
            "repos_url": "https://api.github.com/users/sahildua2305/repos",
            "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
            "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 76672222,
            "name": "go-github",
            "full_name": "sahildua2305/go-github",
            "owner": {
              "login": "sahildua2305",
              "id": 5206277,
              "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/sahildua2305",
              "html_url": "https://github.com/sahildua2305",
              "followers_url": "https://api.github.com/users/sahildua2305/followers",
              "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
              "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
              "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
              "repos_url": "https://api.github.com/users/sahildua2305/repos",
              "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
              "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/sahildua2305/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": true,
            "url": "https://api.github.com/repos/sahildua2305/go-github",
            "forks_url": "https://api.github.com/repos/sahildua2305/go-github/forks",
            "keys_url": "https://api.github.com/repos/sahildua2305/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/sahildua2305/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/sahildua2305/go-github/teams",
            "hooks_url": "https://api.github.com/repos/sahildua2305/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/sahildua2305/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/sahildua2305/go-github/events",
            "assignees_url": "https://api.github.com/repos/sahildua2305/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/sahildua2305/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/sahildua2305/go-github/tags",
            "blobs_url": "https://api.github.com/repos/sahildua2305/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/sahildua2305/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/sahildua2305/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/sahildua2305/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/sahildua2305/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/sahildua2305/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/sahildua2305/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/sahildua2305/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/sahildua2305/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/sahildua2305/go-github/subscription",
            "commits_url": "https://api.github.com/repos/sahildua2305/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/sahildua2305/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/sahildua2305/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/sahildua2305/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/sahildua2305/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/sahildua2305/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/sahildua2305/go-github/merges",
            "archive_url": "https://api.github.com/repos/sahildua2305/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/sahildua2305/go-github/downloads",
            "issues_url": "https://api.github.com/repos/sahildua2305/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/sahildua2305/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/sahildua2305/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/sahildua2305/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/sahildua2305/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/sahildua2305/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/sahildua2305/go-github/deployments",
            "created_at": "2016-12-16T17:23:37Z",
            "updated_at": "2016-12-16T17:23:39Z",
            "pushed_at": "2017-05-07T17:06:15Z",
            "git_url": "git://github.com/sahildua2305/go-github.git",
            "ssh_url": "git@github.com:sahildua2305/go-github.git",
            "clone_url": "https://github.com/sahildua2305/go-github.git",
            "svn_url": "https://github.com/sahildua2305/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1522,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "Go",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "google:master",
          "ref": "master",
          "sha": "e8d46665e050742f457a58088b1e6b794b2ae966",
          "user": {
            "login": "google",
            "id": 1342004,
            "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/google",
            "html_url": "https://github.com/google",
            "followers_url": "https://api.github.com/users/google/followers",
            "following_url": "https://api.github.com/users/google/following{/other_user}",
            "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/google/subscriptions",
            "organizations_url": "https://api.github.com/users/google/orgs",
            "repos_url": "https://api.github.com/users/google/repos",
            "events_url": "https://api.github.com/users/google/events{/privacy}",
            "received_events_url": "https://api.github.com/users/google/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 10270722,
            "name": "go-github",
            "full_name": "google/go-github",
            "owner": {
              "login": "google",
              "id": 1342004,
              "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/google",
              "html_url": "https://github.com/google",
              "followers_url": "https://api.github.com/users/google/followers",
              "following_url": "https://api.github.com/users/google/following{/other_user}",
              "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/google/subscriptions",
              "organizations_url": "https://api.github.com/users/google/orgs",
              "repos_url": "https://api.github.com/users/google/repos",
              "events_url": "https://api.github.com/users/google/events{/privacy}",
              "received_events_url": "https://api.github.com/users/google/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/google/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": false,
            "url": "https://api.github.com/repos/google/go-github",
            "forks_url": "https://api.github.com/repos/google/go-github/forks",
            "keys_url": "https://api.github.com/repos/google/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/google/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/google/go-github/teams",
            "hooks_url": "https://api.github.com/repos/google/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/google/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/google/go-github/events",
            "assignees_url": "https://api.github.com/repos/google/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/google/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/google/go-github/tags",
            "blobs_url": "https://api.github.com/repos/google/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/google/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/google/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/google/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/google/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/google/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/google/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/google/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/google/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/google/go-github/subscription",
            "commits_url": "https://api.github.com/repos/google/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/google/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/google/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/google/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/google/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/google/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/google/go-github/merges",
            "archive_url": "https://api.github.com/repos/google/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/google/go-github/downloads",
            "issues_url": "https://api.github.com/repos/google/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/google/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/google/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/google/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/google/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/google/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/google/go-github/deployments",
            "created_at": "2013-05-24T16:42:58Z",
            "updated_at": "2017-05-07T18:02:38Z",
            "pushed_at": "2017-05-07T17:06:16Z",
            "git_url": "git://github.com/google/go-github.git",
            "ssh_url": "git@github.com:google/go-github.git",
            "clone_url": "https://github.com/google/go-github.git",
            "svn_url": "https://github.com/google/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1443,
            "stargazers_count": 2575,
            "watchers_count": 2575,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 585,
            "mirror_url": null,
            "open_issues_count": 44,
            "forks": 585,
            "open_issues": 44,
            "watchers": 2575,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/628"
          },
          "issue": {
            "href": "https://api.github.com/repos/google/go-github/issues/628"
          },
          "comments": {
            "href": "https://api.github.com/repos/google/go-github/issues/628/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/google/go-github/statuses/16e47d3aea527dc9d49de5e150953f802422450e"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-07T20:22:06Z",
    "org": {
      "id": 1342004,
      "login": "google",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/google",
      "avatar_url": "https://avatars.githubusercontent.com/u/1342004?"
    }
  },
  {
    "id": "5825292995",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10270722,
      "name": "google/go-github",
      "url": "https://api.github.com/repos/google/go-github"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/google/go-github/pulls/comments/115152757",
        "pull_request_review_id": 36672426,
        "id": 115152757,
        "diff_hunk": "@@ -11,32 +11,25 @@ import (\n \t\"time\"\n )\n \n+type Metric struct {\n+\tName    *string ` + "`" + `json:\"name\"` + "`" + `\n+\tKey     *string ` + "`" + `json:\"key\"` + "`" + `\n+\tURL     *string ` + "`" + `json:\"url\"` + "`" + `\n+\tHTMLURL *string ` + "`" + `json:\"html_url\"` + "`" + `\n+}\n+\n+type CommunityHealthFiles struct {\n+\tCodeOfConduct *Metric ` + "`" + `json:\"code_conduct\"` + "`" + `",
        "path": "github/repos_community_health.go",
        "position": null,
        "original_position": 12,
        "commit_id": "16e47d3aea527dc9d49de5e150953f802422450e",
        "original_commit_id": "b40a4c011809a0df754227ae60f6f99f3fcd87f0",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "This should be be ` + "`" + `json:\"code_of_conduct\"` + "`" + `.",
        "created_at": "2017-05-07T20:13:50Z",
        "updated_at": "2017-05-07T20:15:07Z",
        "html_url": "https://github.com/google/go-github/pull/628#discussion_r115152757",
        "pull_request_url": "https://api.github.com/repos/google/go-github/pulls/628",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments/115152757"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/628#discussion_r115152757"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/google/go-github/pulls/628",
        "id": 119070615,
        "html_url": "https://github.com/google/go-github/pull/628",
        "diff_url": "https://github.com/google/go-github/pull/628.diff",
        "patch_url": "https://github.com/google/go-github/pull/628.patch",
        "issue_url": "https://api.github.com/repos/google/go-github/issues/628",
        "number": 628,
        "state": "open",
        "locked": false,
        "title": "Add Community Health metrics endpoint",
        "user": {
          "login": "sahildua2305",
          "id": 5206277,
          "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/sahildua2305",
          "html_url": "https://github.com/sahildua2305",
          "followers_url": "https://api.github.com/users/sahildua2305/followers",
          "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
          "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
          "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
          "repos_url": "https://api.github.com/users/sahildua2305/repos",
          "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
          "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "This is a new API released by GitHub and is currently available as a\r\npreview only.\r\nLink - https://developer.github.com/v3/repos/community/#retrieve-community-health-metrics\r\n\r\nFixes: #553",
        "created_at": "2017-05-04T21:28:15Z",
        "updated_at": "2017-05-07T20:15:07Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "1e352e75242ce8cbab2443614eab938dec7d64c7",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/google/go-github/pulls/628/commits",
        "review_comments_url": "https://api.github.com/repos/google/go-github/pulls/628/comments",
        "review_comment_url": "https://api.github.com/repos/google/go-github/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/google/go-github/issues/628/comments",
        "statuses_url": "https://api.github.com/repos/google/go-github/statuses/16e47d3aea527dc9d49de5e150953f802422450e",
        "head": {
          "label": "sahildua2305:add-community-health",
          "ref": "add-community-health",
          "sha": "16e47d3aea527dc9d49de5e150953f802422450e",
          "user": {
            "login": "sahildua2305",
            "id": 5206277,
            "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/sahildua2305",
            "html_url": "https://github.com/sahildua2305",
            "followers_url": "https://api.github.com/users/sahildua2305/followers",
            "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
            "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
            "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
            "repos_url": "https://api.github.com/users/sahildua2305/repos",
            "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
            "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 76672222,
            "name": "go-github",
            "full_name": "sahildua2305/go-github",
            "owner": {
              "login": "sahildua2305",
              "id": 5206277,
              "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/sahildua2305",
              "html_url": "https://github.com/sahildua2305",
              "followers_url": "https://api.github.com/users/sahildua2305/followers",
              "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
              "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
              "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
              "repos_url": "https://api.github.com/users/sahildua2305/repos",
              "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
              "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/sahildua2305/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": true,
            "url": "https://api.github.com/repos/sahildua2305/go-github",
            "forks_url": "https://api.github.com/repos/sahildua2305/go-github/forks",
            "keys_url": "https://api.github.com/repos/sahildua2305/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/sahildua2305/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/sahildua2305/go-github/teams",
            "hooks_url": "https://api.github.com/repos/sahildua2305/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/sahildua2305/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/sahildua2305/go-github/events",
            "assignees_url": "https://api.github.com/repos/sahildua2305/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/sahildua2305/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/sahildua2305/go-github/tags",
            "blobs_url": "https://api.github.com/repos/sahildua2305/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/sahildua2305/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/sahildua2305/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/sahildua2305/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/sahildua2305/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/sahildua2305/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/sahildua2305/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/sahildua2305/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/sahildua2305/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/sahildua2305/go-github/subscription",
            "commits_url": "https://api.github.com/repos/sahildua2305/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/sahildua2305/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/sahildua2305/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/sahildua2305/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/sahildua2305/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/sahildua2305/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/sahildua2305/go-github/merges",
            "archive_url": "https://api.github.com/repos/sahildua2305/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/sahildua2305/go-github/downloads",
            "issues_url": "https://api.github.com/repos/sahildua2305/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/sahildua2305/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/sahildua2305/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/sahildua2305/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/sahildua2305/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/sahildua2305/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/sahildua2305/go-github/deployments",
            "created_at": "2016-12-16T17:23:37Z",
            "updated_at": "2016-12-16T17:23:39Z",
            "pushed_at": "2017-05-07T17:06:15Z",
            "git_url": "git://github.com/sahildua2305/go-github.git",
            "ssh_url": "git@github.com:sahildua2305/go-github.git",
            "clone_url": "https://github.com/sahildua2305/go-github.git",
            "svn_url": "https://github.com/sahildua2305/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1522,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "Go",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "google:master",
          "ref": "master",
          "sha": "e8d46665e050742f457a58088b1e6b794b2ae966",
          "user": {
            "login": "google",
            "id": 1342004,
            "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/google",
            "html_url": "https://github.com/google",
            "followers_url": "https://api.github.com/users/google/followers",
            "following_url": "https://api.github.com/users/google/following{/other_user}",
            "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/google/subscriptions",
            "organizations_url": "https://api.github.com/users/google/orgs",
            "repos_url": "https://api.github.com/users/google/repos",
            "events_url": "https://api.github.com/users/google/events{/privacy}",
            "received_events_url": "https://api.github.com/users/google/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 10270722,
            "name": "go-github",
            "full_name": "google/go-github",
            "owner": {
              "login": "google",
              "id": 1342004,
              "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/google",
              "html_url": "https://github.com/google",
              "followers_url": "https://api.github.com/users/google/followers",
              "following_url": "https://api.github.com/users/google/following{/other_user}",
              "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/google/subscriptions",
              "organizations_url": "https://api.github.com/users/google/orgs",
              "repos_url": "https://api.github.com/users/google/repos",
              "events_url": "https://api.github.com/users/google/events{/privacy}",
              "received_events_url": "https://api.github.com/users/google/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/google/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": false,
            "url": "https://api.github.com/repos/google/go-github",
            "forks_url": "https://api.github.com/repos/google/go-github/forks",
            "keys_url": "https://api.github.com/repos/google/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/google/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/google/go-github/teams",
            "hooks_url": "https://api.github.com/repos/google/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/google/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/google/go-github/events",
            "assignees_url": "https://api.github.com/repos/google/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/google/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/google/go-github/tags",
            "blobs_url": "https://api.github.com/repos/google/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/google/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/google/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/google/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/google/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/google/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/google/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/google/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/google/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/google/go-github/subscription",
            "commits_url": "https://api.github.com/repos/google/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/google/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/google/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/google/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/google/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/google/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/google/go-github/merges",
            "archive_url": "https://api.github.com/repos/google/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/google/go-github/downloads",
            "issues_url": "https://api.github.com/repos/google/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/google/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/google/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/google/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/google/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/google/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/google/go-github/deployments",
            "created_at": "2013-05-24T16:42:58Z",
            "updated_at": "2017-05-07T18:02:38Z",
            "pushed_at": "2017-05-07T17:06:16Z",
            "git_url": "git://github.com/google/go-github.git",
            "ssh_url": "git@github.com:google/go-github.git",
            "clone_url": "https://github.com/google/go-github.git",
            "svn_url": "https://github.com/google/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1443,
            "stargazers_count": 2575,
            "watchers_count": 2575,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 585,
            "mirror_url": null,
            "open_issues_count": 44,
            "forks": 585,
            "open_issues": 44,
            "watchers": 2575,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/628"
          },
          "issue": {
            "href": "https://api.github.com/repos/google/go-github/issues/628"
          },
          "comments": {
            "href": "https://api.github.com/repos/google/go-github/issues/628/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/google/go-github/statuses/16e47d3aea527dc9d49de5e150953f802422450e"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-07T20:13:50Z",
    "org": {
      "id": 1342004,
      "login": "google",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/google",
      "avatar_url": "https://avatars.githubusercontent.com/u/1342004?"
    }
  },
  {
    "id": "5823679266",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10270722,
      "name": "google/go-github",
      "url": "https://api.github.com/repos/google/go-github"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/google/go-github/issues/628",
        "repository_url": "https://api.github.com/repos/google/go-github",
        "labels_url": "https://api.github.com/repos/google/go-github/issues/628/labels{/name}",
        "comments_url": "https://api.github.com/repos/google/go-github/issues/628/comments",
        "events_url": "https://api.github.com/repos/google/go-github/issues/628/events",
        "html_url": "https://github.com/google/go-github/pull/628",
        "id": 226413871,
        "number": 628,
        "title": "Add Community Health metrics endpoint",
        "user": {
          "login": "sahildua2305",
          "id": 5206277,
          "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/sahildua2305",
          "html_url": "https://github.com/sahildua2305",
          "followers_url": "https://api.github.com/users/sahildua2305/followers",
          "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
          "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
          "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
          "repos_url": "https://api.github.com/users/sahildua2305/repos",
          "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
          "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 2,
        "created_at": "2017-05-04T21:28:15Z",
        "updated_at": "2017-05-07T04:25:57Z",
        "closed_at": null,
        "pull_request": {
          "url": "https://api.github.com/repos/google/go-github/pulls/628",
          "html_url": "https://github.com/google/go-github/pull/628",
          "diff_url": "https://github.com/google/go-github/pull/628.diff",
          "patch_url": "https://github.com/google/go-github/pull/628.patch"
        },
        "body": "This is a new API released by GitHub and is currently available as a\r\npreview only.\r\nLink - https://developer.github.com/v3/repos/community/#retrieve-community-health-metrics\r\n\r\nFixes: #553"
      },
      "comment": {
        "url": "https://api.github.com/repos/google/go-github/issues/comments/299681659",
        "html_url": "https://github.com/google/go-github/pull/628#issuecomment-299681659",
        "issue_url": "https://api.github.com/repos/google/go-github/issues/628",
        "id": 299681659,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-07T04:25:57Z",
        "updated_at": "2017-05-07T04:25:57Z",
        "body": "It's hard to predict how exactly the response will evolve, if at all, but that sounds reasonable to me. I'm not against it.\r\n\r\nMy only change suggestion is to call ` + "`" + `MetricsFiles` + "`" + ` as ` + "`" + `CommunityHealthFiles` + "`" + ` instead, what do you think?"
      }
    },
    "public": true,
    "created_at": "2017-05-07T04:25:57Z",
    "org": {
      "id": 1342004,
      "login": "google",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/google",
      "avatar_url": "https://avatars.githubusercontent.com/u/1342004?"
    }
  },
  {
    "id": "5822632836",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1812190,
      "name": "russross/blackfriday",
      "url": "https://api.github.com/repos/russross/blackfriday"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/russross/blackfriday/pulls/comments/115124631",
        "pull_request_review_id": 36648275,
        "id": 115124631,
        "diff_hunk": "@@ -8,31 +12,52 @@ punctuation substitutions, etc.), and it is safe for all utf-8\n (unicode) input.\n \n HTML output is currently supported, along with Smartypants\n-extensions. An experimental LaTeX output engine is also included.\n+extensions.\n \n It started as a translation from C of [Sundown][3].\n \n \n Installation\n ------------\n \n-Blackfriday is compatible with Go 1. If you are using an older\n-release of Go, consider using v1.1 of blackfriday, which was based\n-on the last stable release of Go prior to Go 1. You can find it as a\n-tagged commit on github.\n-\n-With Go 1 and git installed:\n+Blackfriday is compatible with any modern Go release. With Go 1.7 and git\n+installed:\n \n-    go get github.com/russross/blackfriday\n+    go get gopkg.in/russross/blackfriday.v2\n \n will download, compile, and install the package into your ` + "`" + `$GOPATH` + "`" + `\n directory hierarchy. Alternatively, you can achieve the same if you",
        "path": "README.md",
        "position": 36,
        "original_position": 36,
        "commit_id": "aab8b89f4a157c2d6f51d87b8347b66705dc6c81",
        "original_commit_id": "aab8b89f4a157c2d6f51d87b8347b66705dc6c81",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "This \"Alternatively\" section should probably be removed. It's easier to tell people to ` + "`" + `go get -u` + "`" + ` the import path, they can figure out the rest by now.",
        "created_at": "2017-05-06T17:09:14Z",
        "updated_at": "2017-05-06T17:14:35Z",
        "html_url": "https://github.com/russross/blackfriday/pull/354#discussion_r115124631",
        "pull_request_url": "https://api.github.com/repos/russross/blackfriday/pulls/354",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/comments/115124631"
          },
          "html": {
            "href": "https://github.com/russross/blackfriday/pull/354#discussion_r115124631"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/354"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/russross/blackfriday/pulls/354",
        "id": 119307986,
        "html_url": "https://github.com/russross/blackfriday/pull/354",
        "diff_url": "https://github.com/russross/blackfriday/pull/354.diff",
        "patch_url": "https://github.com/russross/blackfriday/pull/354.patch",
        "issue_url": "https://api.github.com/repos/russross/blackfriday/issues/354",
        "number": 354,
        "state": "open",
        "locked": false,
        "title": "Document V2 in master README",
        "user": {
          "login": "rtfb",
          "id": 426340,
          "avatar_url": "https://avatars0.githubusercontent.com/u/426340?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/rtfb",
          "html_url": "https://github.com/rtfb",
          "followers_url": "https://api.github.com/users/rtfb/followers",
          "following_url": "https://api.github.com/users/rtfb/following{/other_user}",
          "gists_url": "https://api.github.com/users/rtfb/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/rtfb/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/rtfb/subscriptions",
          "organizations_url": "https://api.github.com/users/rtfb/orgs",
          "repos_url": "https://api.github.com/users/rtfb/repos",
          "events_url": "https://api.github.com/users/rtfb/events{/privacy}",
          "received_events_url": "https://api.github.com/users/rtfb/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "",
        "created_at": "2017-05-06T16:55:32Z",
        "updated_at": "2017-05-06T17:14:35Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "138ef7767abebe0a9e5eff11d5bcf3752883452a",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/russross/blackfriday/pulls/354/commits",
        "review_comments_url": "https://api.github.com/repos/russross/blackfriday/pulls/354/comments",
        "review_comment_url": "https://api.github.com/repos/russross/blackfriday/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/russross/blackfriday/issues/354/comments",
        "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/aab8b89f4a157c2d6f51d87b8347b66705dc6c81",
        "head": {
          "label": "russross:readme-for-v2",
          "ref": "readme-for-v2",
          "sha": "aab8b89f4a157c2d6f51d87b8347b66705dc6c81",
          "user": {
            "login": "russross",
            "id": 65428,
            "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/russross",
            "html_url": "https://github.com/russross",
            "followers_url": "https://api.github.com/users/russross/followers",
            "following_url": "https://api.github.com/users/russross/following{/other_user}",
            "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
            "organizations_url": "https://api.github.com/users/russross/orgs",
            "repos_url": "https://api.github.com/users/russross/repos",
            "events_url": "https://api.github.com/users/russross/events{/privacy}",
            "received_events_url": "https://api.github.com/users/russross/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 1812190,
            "name": "blackfriday",
            "full_name": "russross/blackfriday",
            "owner": {
              "login": "russross",
              "id": 65428,
              "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/russross",
              "html_url": "https://github.com/russross",
              "followers_url": "https://api.github.com/users/russross/followers",
              "following_url": "https://api.github.com/users/russross/following{/other_user}",
              "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
              "organizations_url": "https://api.github.com/users/russross/orgs",
              "repos_url": "https://api.github.com/users/russross/repos",
              "events_url": "https://api.github.com/users/russross/events{/privacy}",
              "received_events_url": "https://api.github.com/users/russross/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/russross/blackfriday",
            "description": "Blackfriday: a markdown processor for Go",
            "fork": false,
            "url": "https://api.github.com/repos/russross/blackfriday",
            "forks_url": "https://api.github.com/repos/russross/blackfriday/forks",
            "keys_url": "https://api.github.com/repos/russross/blackfriday/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/russross/blackfriday/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/russross/blackfriday/teams",
            "hooks_url": "https://api.github.com/repos/russross/blackfriday/hooks",
            "issue_events_url": "https://api.github.com/repos/russross/blackfriday/issues/events{/number}",
            "events_url": "https://api.github.com/repos/russross/blackfriday/events",
            "assignees_url": "https://api.github.com/repos/russross/blackfriday/assignees{/user}",
            "branches_url": "https://api.github.com/repos/russross/blackfriday/branches{/branch}",
            "tags_url": "https://api.github.com/repos/russross/blackfriday/tags",
            "blobs_url": "https://api.github.com/repos/russross/blackfriday/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/russross/blackfriday/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/russross/blackfriday/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/russross/blackfriday/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/russross/blackfriday/languages",
            "stargazers_url": "https://api.github.com/repos/russross/blackfriday/stargazers",
            "contributors_url": "https://api.github.com/repos/russross/blackfriday/contributors",
            "subscribers_url": "https://api.github.com/repos/russross/blackfriday/subscribers",
            "subscription_url": "https://api.github.com/repos/russross/blackfriday/subscription",
            "commits_url": "https://api.github.com/repos/russross/blackfriday/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/russross/blackfriday/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/russross/blackfriday/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/russross/blackfriday/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/russross/blackfriday/contents/{+path}",
            "compare_url": "https://api.github.com/repos/russross/blackfriday/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/russross/blackfriday/merges",
            "archive_url": "https://api.github.com/repos/russross/blackfriday/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/russross/blackfriday/downloads",
            "issues_url": "https://api.github.com/repos/russross/blackfriday/issues{/number}",
            "pulls_url": "https://api.github.com/repos/russross/blackfriday/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/russross/blackfriday/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/russross/blackfriday/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/russross/blackfriday/labels{/name}",
            "releases_url": "https://api.github.com/repos/russross/blackfriday/releases{/id}",
            "deployments_url": "https://api.github.com/repos/russross/blackfriday/deployments",
            "created_at": "2011-05-27T22:28:58Z",
            "updated_at": "2017-05-06T15:59:07Z",
            "pushed_at": "2017-05-06T16:59:52Z",
            "git_url": "git://github.com/russross/blackfriday.git",
            "ssh_url": "git@github.com:russross/blackfriday.git",
            "clone_url": "https://github.com/russross/blackfriday.git",
            "svn_url": "https://github.com/russross/blackfriday",
            "homepage": "",
            "size": 1163,
            "stargazers_count": 2388,
            "watchers_count": 2388,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 305,
            "mirror_url": null,
            "open_issues_count": 77,
            "forks": 305,
            "open_issues": 77,
            "watchers": 2388,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "russross:master",
          "ref": "master",
          "sha": "b253417e1cb644d645a0a3bb1fa5034c8030127c",
          "user": {
            "login": "russross",
            "id": 65428,
            "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/russross",
            "html_url": "https://github.com/russross",
            "followers_url": "https://api.github.com/users/russross/followers",
            "following_url": "https://api.github.com/users/russross/following{/other_user}",
            "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
            "organizations_url": "https://api.github.com/users/russross/orgs",
            "repos_url": "https://api.github.com/users/russross/repos",
            "events_url": "https://api.github.com/users/russross/events{/privacy}",
            "received_events_url": "https://api.github.com/users/russross/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 1812190,
            "name": "blackfriday",
            "full_name": "russross/blackfriday",
            "owner": {
              "login": "russross",
              "id": 65428,
              "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/russross",
              "html_url": "https://github.com/russross",
              "followers_url": "https://api.github.com/users/russross/followers",
              "following_url": "https://api.github.com/users/russross/following{/other_user}",
              "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
              "organizations_url": "https://api.github.com/users/russross/orgs",
              "repos_url": "https://api.github.com/users/russross/repos",
              "events_url": "https://api.github.com/users/russross/events{/privacy}",
              "received_events_url": "https://api.github.com/users/russross/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/russross/blackfriday",
            "description": "Blackfriday: a markdown processor for Go",
            "fork": false,
            "url": "https://api.github.com/repos/russross/blackfriday",
            "forks_url": "https://api.github.com/repos/russross/blackfriday/forks",
            "keys_url": "https://api.github.com/repos/russross/blackfriday/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/russross/blackfriday/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/russross/blackfriday/teams",
            "hooks_url": "https://api.github.com/repos/russross/blackfriday/hooks",
            "issue_events_url": "https://api.github.com/repos/russross/blackfriday/issues/events{/number}",
            "events_url": "https://api.github.com/repos/russross/blackfriday/events",
            "assignees_url": "https://api.github.com/repos/russross/blackfriday/assignees{/user}",
            "branches_url": "https://api.github.com/repos/russross/blackfriday/branches{/branch}",
            "tags_url": "https://api.github.com/repos/russross/blackfriday/tags",
            "blobs_url": "https://api.github.com/repos/russross/blackfriday/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/russross/blackfriday/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/russross/blackfriday/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/russross/blackfriday/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/russross/blackfriday/languages",
            "stargazers_url": "https://api.github.com/repos/russross/blackfriday/stargazers",
            "contributors_url": "https://api.github.com/repos/russross/blackfriday/contributors",
            "subscribers_url": "https://api.github.com/repos/russross/blackfriday/subscribers",
            "subscription_url": "https://api.github.com/repos/russross/blackfriday/subscription",
            "commits_url": "https://api.github.com/repos/russross/blackfriday/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/russross/blackfriday/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/russross/blackfriday/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/russross/blackfriday/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/russross/blackfriday/contents/{+path}",
            "compare_url": "https://api.github.com/repos/russross/blackfriday/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/russross/blackfriday/merges",
            "archive_url": "https://api.github.com/repos/russross/blackfriday/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/russross/blackfriday/downloads",
            "issues_url": "https://api.github.com/repos/russross/blackfriday/issues{/number}",
            "pulls_url": "https://api.github.com/repos/russross/blackfriday/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/russross/blackfriday/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/russross/blackfriday/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/russross/blackfriday/labels{/name}",
            "releases_url": "https://api.github.com/repos/russross/blackfriday/releases{/id}",
            "deployments_url": "https://api.github.com/repos/russross/blackfriday/deployments",
            "created_at": "2011-05-27T22:28:58Z",
            "updated_at": "2017-05-06T15:59:07Z",
            "pushed_at": "2017-05-06T16:59:52Z",
            "git_url": "git://github.com/russross/blackfriday.git",
            "ssh_url": "git@github.com:russross/blackfriday.git",
            "clone_url": "https://github.com/russross/blackfriday.git",
            "svn_url": "https://github.com/russross/blackfriday",
            "homepage": "",
            "size": 1163,
            "stargazers_count": 2388,
            "watchers_count": 2388,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 305,
            "mirror_url": null,
            "open_issues_count": 77,
            "forks": 305,
            "open_issues": 77,
            "watchers": 2388,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/354"
          },
          "html": {
            "href": "https://github.com/russross/blackfriday/pull/354"
          },
          "issue": {
            "href": "https://api.github.com/repos/russross/blackfriday/issues/354"
          },
          "comments": {
            "href": "https://api.github.com/repos/russross/blackfriday/issues/354/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/354/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/354/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/russross/blackfriday/statuses/aab8b89f4a157c2d6f51d87b8347b66705dc6c81"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-06T17:09:14Z"
  },
  {
    "id": "5822632835",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1812190,
      "name": "russross/blackfriday",
      "url": "https://api.github.com/repos/russross/blackfriday"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/russross/blackfriday/pulls/comments/115124596",
        "pull_request_review_id": 36648275,
        "id": 115124596,
        "diff_hunk": "@@ -8,31 +12,52 @@ punctuation substitutions, etc.), and it is safe for all utf-8\n (unicode) input.\n \n HTML output is currently supported, along with Smartypants\n-extensions. An experimental LaTeX output engine is also included.\n+extensions.\n \n It started as a translation from C of [Sundown][3].\n \n \n Installation\n ------------\n \n-Blackfriday is compatible with Go 1. If you are using an older\n-release of Go, consider using v1.1 of blackfriday, which was based\n-on the last stable release of Go prior to Go 1. You can find it as a\n-tagged commit on github.\n-\n-With Go 1 and git installed:\n+Blackfriday is compatible with any modern Go release. With Go 1.7 and git\n+installed:",
        "path": "README.md",
        "position": 30,
        "original_position": 30,
        "commit_id": "aab8b89f4a157c2d6f51d87b8347b66705dc6c81",
        "original_commit_id": "aab8b89f4a157c2d6f51d87b8347b66705dc6c81",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "This is a little confusing. First it says \"any modern Go release\", then \"Go 1.7\". Can we be more clear?",
        "created_at": "2017-05-06T17:08:01Z",
        "updated_at": "2017-05-06T17:14:35Z",
        "html_url": "https://github.com/russross/blackfriday/pull/354#discussion_r115124596",
        "pull_request_url": "https://api.github.com/repos/russross/blackfriday/pulls/354",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/comments/115124596"
          },
          "html": {
            "href": "https://github.com/russross/blackfriday/pull/354#discussion_r115124596"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/354"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/russross/blackfriday/pulls/354",
        "id": 119307986,
        "html_url": "https://github.com/russross/blackfriday/pull/354",
        "diff_url": "https://github.com/russross/blackfriday/pull/354.diff",
        "patch_url": "https://github.com/russross/blackfriday/pull/354.patch",
        "issue_url": "https://api.github.com/repos/russross/blackfriday/issues/354",
        "number": 354,
        "state": "open",
        "locked": false,
        "title": "Document V2 in master README",
        "user": {
          "login": "rtfb",
          "id": 426340,
          "avatar_url": "https://avatars0.githubusercontent.com/u/426340?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/rtfb",
          "html_url": "https://github.com/rtfb",
          "followers_url": "https://api.github.com/users/rtfb/followers",
          "following_url": "https://api.github.com/users/rtfb/following{/other_user}",
          "gists_url": "https://api.github.com/users/rtfb/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/rtfb/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/rtfb/subscriptions",
          "organizations_url": "https://api.github.com/users/rtfb/orgs",
          "repos_url": "https://api.github.com/users/rtfb/repos",
          "events_url": "https://api.github.com/users/rtfb/events{/privacy}",
          "received_events_url": "https://api.github.com/users/rtfb/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "",
        "created_at": "2017-05-06T16:55:32Z",
        "updated_at": "2017-05-06T17:14:35Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "138ef7767abebe0a9e5eff11d5bcf3752883452a",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/russross/blackfriday/pulls/354/commits",
        "review_comments_url": "https://api.github.com/repos/russross/blackfriday/pulls/354/comments",
        "review_comment_url": "https://api.github.com/repos/russross/blackfriday/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/russross/blackfriday/issues/354/comments",
        "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/aab8b89f4a157c2d6f51d87b8347b66705dc6c81",
        "head": {
          "label": "russross:readme-for-v2",
          "ref": "readme-for-v2",
          "sha": "aab8b89f4a157c2d6f51d87b8347b66705dc6c81",
          "user": {
            "login": "russross",
            "id": 65428,
            "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/russross",
            "html_url": "https://github.com/russross",
            "followers_url": "https://api.github.com/users/russross/followers",
            "following_url": "https://api.github.com/users/russross/following{/other_user}",
            "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
            "organizations_url": "https://api.github.com/users/russross/orgs",
            "repos_url": "https://api.github.com/users/russross/repos",
            "events_url": "https://api.github.com/users/russross/events{/privacy}",
            "received_events_url": "https://api.github.com/users/russross/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 1812190,
            "name": "blackfriday",
            "full_name": "russross/blackfriday",
            "owner": {
              "login": "russross",
              "id": 65428,
              "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/russross",
              "html_url": "https://github.com/russross",
              "followers_url": "https://api.github.com/users/russross/followers",
              "following_url": "https://api.github.com/users/russross/following{/other_user}",
              "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
              "organizations_url": "https://api.github.com/users/russross/orgs",
              "repos_url": "https://api.github.com/users/russross/repos",
              "events_url": "https://api.github.com/users/russross/events{/privacy}",
              "received_events_url": "https://api.github.com/users/russross/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/russross/blackfriday",
            "description": "Blackfriday: a markdown processor for Go",
            "fork": false,
            "url": "https://api.github.com/repos/russross/blackfriday",
            "forks_url": "https://api.github.com/repos/russross/blackfriday/forks",
            "keys_url": "https://api.github.com/repos/russross/blackfriday/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/russross/blackfriday/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/russross/blackfriday/teams",
            "hooks_url": "https://api.github.com/repos/russross/blackfriday/hooks",
            "issue_events_url": "https://api.github.com/repos/russross/blackfriday/issues/events{/number}",
            "events_url": "https://api.github.com/repos/russross/blackfriday/events",
            "assignees_url": "https://api.github.com/repos/russross/blackfriday/assignees{/user}",
            "branches_url": "https://api.github.com/repos/russross/blackfriday/branches{/branch}",
            "tags_url": "https://api.github.com/repos/russross/blackfriday/tags",
            "blobs_url": "https://api.github.com/repos/russross/blackfriday/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/russross/blackfriday/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/russross/blackfriday/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/russross/blackfriday/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/russross/blackfriday/languages",
            "stargazers_url": "https://api.github.com/repos/russross/blackfriday/stargazers",
            "contributors_url": "https://api.github.com/repos/russross/blackfriday/contributors",
            "subscribers_url": "https://api.github.com/repos/russross/blackfriday/subscribers",
            "subscription_url": "https://api.github.com/repos/russross/blackfriday/subscription",
            "commits_url": "https://api.github.com/repos/russross/blackfriday/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/russross/blackfriday/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/russross/blackfriday/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/russross/blackfriday/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/russross/blackfriday/contents/{+path}",
            "compare_url": "https://api.github.com/repos/russross/blackfriday/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/russross/blackfriday/merges",
            "archive_url": "https://api.github.com/repos/russross/blackfriday/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/russross/blackfriday/downloads",
            "issues_url": "https://api.github.com/repos/russross/blackfriday/issues{/number}",
            "pulls_url": "https://api.github.com/repos/russross/blackfriday/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/russross/blackfriday/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/russross/blackfriday/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/russross/blackfriday/labels{/name}",
            "releases_url": "https://api.github.com/repos/russross/blackfriday/releases{/id}",
            "deployments_url": "https://api.github.com/repos/russross/blackfriday/deployments",
            "created_at": "2011-05-27T22:28:58Z",
            "updated_at": "2017-05-06T15:59:07Z",
            "pushed_at": "2017-05-06T16:59:52Z",
            "git_url": "git://github.com/russross/blackfriday.git",
            "ssh_url": "git@github.com:russross/blackfriday.git",
            "clone_url": "https://github.com/russross/blackfriday.git",
            "svn_url": "https://github.com/russross/blackfriday",
            "homepage": "",
            "size": 1163,
            "stargazers_count": 2388,
            "watchers_count": 2388,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 305,
            "mirror_url": null,
            "open_issues_count": 77,
            "forks": 305,
            "open_issues": 77,
            "watchers": 2388,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "russross:master",
          "ref": "master",
          "sha": "b253417e1cb644d645a0a3bb1fa5034c8030127c",
          "user": {
            "login": "russross",
            "id": 65428,
            "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/russross",
            "html_url": "https://github.com/russross",
            "followers_url": "https://api.github.com/users/russross/followers",
            "following_url": "https://api.github.com/users/russross/following{/other_user}",
            "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
            "organizations_url": "https://api.github.com/users/russross/orgs",
            "repos_url": "https://api.github.com/users/russross/repos",
            "events_url": "https://api.github.com/users/russross/events{/privacy}",
            "received_events_url": "https://api.github.com/users/russross/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 1812190,
            "name": "blackfriday",
            "full_name": "russross/blackfriday",
            "owner": {
              "login": "russross",
              "id": 65428,
              "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/russross",
              "html_url": "https://github.com/russross",
              "followers_url": "https://api.github.com/users/russross/followers",
              "following_url": "https://api.github.com/users/russross/following{/other_user}",
              "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
              "organizations_url": "https://api.github.com/users/russross/orgs",
              "repos_url": "https://api.github.com/users/russross/repos",
              "events_url": "https://api.github.com/users/russross/events{/privacy}",
              "received_events_url": "https://api.github.com/users/russross/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/russross/blackfriday",
            "description": "Blackfriday: a markdown processor for Go",
            "fork": false,
            "url": "https://api.github.com/repos/russross/blackfriday",
            "forks_url": "https://api.github.com/repos/russross/blackfriday/forks",
            "keys_url": "https://api.github.com/repos/russross/blackfriday/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/russross/blackfriday/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/russross/blackfriday/teams",
            "hooks_url": "https://api.github.com/repos/russross/blackfriday/hooks",
            "issue_events_url": "https://api.github.com/repos/russross/blackfriday/issues/events{/number}",
            "events_url": "https://api.github.com/repos/russross/blackfriday/events",
            "assignees_url": "https://api.github.com/repos/russross/blackfriday/assignees{/user}",
            "branches_url": "https://api.github.com/repos/russross/blackfriday/branches{/branch}",
            "tags_url": "https://api.github.com/repos/russross/blackfriday/tags",
            "blobs_url": "https://api.github.com/repos/russross/blackfriday/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/russross/blackfriday/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/russross/blackfriday/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/russross/blackfriday/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/russross/blackfriday/languages",
            "stargazers_url": "https://api.github.com/repos/russross/blackfriday/stargazers",
            "contributors_url": "https://api.github.com/repos/russross/blackfriday/contributors",
            "subscribers_url": "https://api.github.com/repos/russross/blackfriday/subscribers",
            "subscription_url": "https://api.github.com/repos/russross/blackfriday/subscription",
            "commits_url": "https://api.github.com/repos/russross/blackfriday/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/russross/blackfriday/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/russross/blackfriday/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/russross/blackfriday/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/russross/blackfriday/contents/{+path}",
            "compare_url": "https://api.github.com/repos/russross/blackfriday/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/russross/blackfriday/merges",
            "archive_url": "https://api.github.com/repos/russross/blackfriday/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/russross/blackfriday/downloads",
            "issues_url": "https://api.github.com/repos/russross/blackfriday/issues{/number}",
            "pulls_url": "https://api.github.com/repos/russross/blackfriday/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/russross/blackfriday/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/russross/blackfriday/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/russross/blackfriday/labels{/name}",
            "releases_url": "https://api.github.com/repos/russross/blackfriday/releases{/id}",
            "deployments_url": "https://api.github.com/repos/russross/blackfriday/deployments",
            "created_at": "2011-05-27T22:28:58Z",
            "updated_at": "2017-05-06T15:59:07Z",
            "pushed_at": "2017-05-06T16:59:52Z",
            "git_url": "git://github.com/russross/blackfriday.git",
            "ssh_url": "git@github.com:russross/blackfriday.git",
            "clone_url": "https://github.com/russross/blackfriday.git",
            "svn_url": "https://github.com/russross/blackfriday",
            "homepage": "",
            "size": 1163,
            "stargazers_count": 2388,
            "watchers_count": 2388,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 305,
            "mirror_url": null,
            "open_issues_count": 77,
            "forks": 305,
            "open_issues": 77,
            "watchers": 2388,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/354"
          },
          "html": {
            "href": "https://github.com/russross/blackfriday/pull/354"
          },
          "issue": {
            "href": "https://api.github.com/repos/russross/blackfriday/issues/354"
          },
          "comments": {
            "href": "https://api.github.com/repos/russross/blackfriday/issues/354/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/354/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/354/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/russross/blackfriday/statuses/aab8b89f4a157c2d6f51d87b8347b66705dc6c81"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-06T17:08:01Z"
  },
  {
    "id": "5822632834",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1812190,
      "name": "russross/blackfriday",
      "url": "https://api.github.com/repos/russross/blackfriday"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/russross/blackfriday/pulls/comments/115124713",
        "pull_request_review_id": 36648275,
        "id": 115124713,
        "diff_hunk": "@@ -8,31 +12,52 @@ punctuation substitutions, etc.), and it is safe for all utf-8\n (unicode) input.\n \n HTML output is currently supported, along with Smartypants\n-extensions. An experimental LaTeX output engine is also included.\n+extensions.\n \n It started as a translation from C of [Sundown][3].\n \n \n Installation\n ------------\n \n-Blackfriday is compatible with Go 1. If you are using an older\n-release of Go, consider using v1.1 of blackfriday, which was based\n-on the last stable release of Go prior to Go 1. You can find it as a\n-tagged commit on github.\n-\n-With Go 1 and git installed:\n+Blackfriday is compatible with any modern Go release. With Go 1.7 and git\n+installed:\n \n-    go get github.com/russross/blackfriday\n+    go get gopkg.in/russross/blackfriday.v2\n \n will download, compile, and install the package into your ` + "`" + `$GOPATH` + "`" + `\n directory hierarchy. Alternatively, you can achieve the same if you\n import it into a project:\n \n-    import \"github.com/russross/blackfriday\"\n+    import \"gopkg.in/russross/blackfriday.v2\"\n \n and ` + "`" + `go get` + "`" + ` without parameters.",
        "path": "README.md",
        "position": 42,
        "original_position": 42,
        "commit_id": "aab8b89f4a157c2d6f51d87b8347b66705dc6c81",
        "original_commit_id": "aab8b89f4a157c2d6f51d87b8347b66705dc6c81",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "Is it intentional that the v1 import path is not mentioned at all in the README?",
        "created_at": "2017-05-06T17:12:36Z",
        "updated_at": "2017-05-06T17:14:35Z",
        "html_url": "https://github.com/russross/blackfriday/pull/354#discussion_r115124713",
        "pull_request_url": "https://api.github.com/repos/russross/blackfriday/pulls/354",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/comments/115124713"
          },
          "html": {
            "href": "https://github.com/russross/blackfriday/pull/354#discussion_r115124713"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/354"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/russross/blackfriday/pulls/354",
        "id": 119307986,
        "html_url": "https://github.com/russross/blackfriday/pull/354",
        "diff_url": "https://github.com/russross/blackfriday/pull/354.diff",
        "patch_url": "https://github.com/russross/blackfriday/pull/354.patch",
        "issue_url": "https://api.github.com/repos/russross/blackfriday/issues/354",
        "number": 354,
        "state": "open",
        "locked": false,
        "title": "Document V2 in master README",
        "user": {
          "login": "rtfb",
          "id": 426340,
          "avatar_url": "https://avatars0.githubusercontent.com/u/426340?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/rtfb",
          "html_url": "https://github.com/rtfb",
          "followers_url": "https://api.github.com/users/rtfb/followers",
          "following_url": "https://api.github.com/users/rtfb/following{/other_user}",
          "gists_url": "https://api.github.com/users/rtfb/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/rtfb/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/rtfb/subscriptions",
          "organizations_url": "https://api.github.com/users/rtfb/orgs",
          "repos_url": "https://api.github.com/users/rtfb/repos",
          "events_url": "https://api.github.com/users/rtfb/events{/privacy}",
          "received_events_url": "https://api.github.com/users/rtfb/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "",
        "created_at": "2017-05-06T16:55:32Z",
        "updated_at": "2017-05-06T17:14:35Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "138ef7767abebe0a9e5eff11d5bcf3752883452a",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/russross/blackfriday/pulls/354/commits",
        "review_comments_url": "https://api.github.com/repos/russross/blackfriday/pulls/354/comments",
        "review_comment_url": "https://api.github.com/repos/russross/blackfriday/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/russross/blackfriday/issues/354/comments",
        "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/aab8b89f4a157c2d6f51d87b8347b66705dc6c81",
        "head": {
          "label": "russross:readme-for-v2",
          "ref": "readme-for-v2",
          "sha": "aab8b89f4a157c2d6f51d87b8347b66705dc6c81",
          "user": {
            "login": "russross",
            "id": 65428,
            "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/russross",
            "html_url": "https://github.com/russross",
            "followers_url": "https://api.github.com/users/russross/followers",
            "following_url": "https://api.github.com/users/russross/following{/other_user}",
            "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
            "organizations_url": "https://api.github.com/users/russross/orgs",
            "repos_url": "https://api.github.com/users/russross/repos",
            "events_url": "https://api.github.com/users/russross/events{/privacy}",
            "received_events_url": "https://api.github.com/users/russross/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 1812190,
            "name": "blackfriday",
            "full_name": "russross/blackfriday",
            "owner": {
              "login": "russross",
              "id": 65428,
              "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/russross",
              "html_url": "https://github.com/russross",
              "followers_url": "https://api.github.com/users/russross/followers",
              "following_url": "https://api.github.com/users/russross/following{/other_user}",
              "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
              "organizations_url": "https://api.github.com/users/russross/orgs",
              "repos_url": "https://api.github.com/users/russross/repos",
              "events_url": "https://api.github.com/users/russross/events{/privacy}",
              "received_events_url": "https://api.github.com/users/russross/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/russross/blackfriday",
            "description": "Blackfriday: a markdown processor for Go",
            "fork": false,
            "url": "https://api.github.com/repos/russross/blackfriday",
            "forks_url": "https://api.github.com/repos/russross/blackfriday/forks",
            "keys_url": "https://api.github.com/repos/russross/blackfriday/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/russross/blackfriday/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/russross/blackfriday/teams",
            "hooks_url": "https://api.github.com/repos/russross/blackfriday/hooks",
            "issue_events_url": "https://api.github.com/repos/russross/blackfriday/issues/events{/number}",
            "events_url": "https://api.github.com/repos/russross/blackfriday/events",
            "assignees_url": "https://api.github.com/repos/russross/blackfriday/assignees{/user}",
            "branches_url": "https://api.github.com/repos/russross/blackfriday/branches{/branch}",
            "tags_url": "https://api.github.com/repos/russross/blackfriday/tags",
            "blobs_url": "https://api.github.com/repos/russross/blackfriday/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/russross/blackfriday/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/russross/blackfriday/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/russross/blackfriday/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/russross/blackfriday/languages",
            "stargazers_url": "https://api.github.com/repos/russross/blackfriday/stargazers",
            "contributors_url": "https://api.github.com/repos/russross/blackfriday/contributors",
            "subscribers_url": "https://api.github.com/repos/russross/blackfriday/subscribers",
            "subscription_url": "https://api.github.com/repos/russross/blackfriday/subscription",
            "commits_url": "https://api.github.com/repos/russross/blackfriday/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/russross/blackfriday/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/russross/blackfriday/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/russross/blackfriday/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/russross/blackfriday/contents/{+path}",
            "compare_url": "https://api.github.com/repos/russross/blackfriday/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/russross/blackfriday/merges",
            "archive_url": "https://api.github.com/repos/russross/blackfriday/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/russross/blackfriday/downloads",
            "issues_url": "https://api.github.com/repos/russross/blackfriday/issues{/number}",
            "pulls_url": "https://api.github.com/repos/russross/blackfriday/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/russross/blackfriday/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/russross/blackfriday/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/russross/blackfriday/labels{/name}",
            "releases_url": "https://api.github.com/repos/russross/blackfriday/releases{/id}",
            "deployments_url": "https://api.github.com/repos/russross/blackfriday/deployments",
            "created_at": "2011-05-27T22:28:58Z",
            "updated_at": "2017-05-06T15:59:07Z",
            "pushed_at": "2017-05-06T16:59:52Z",
            "git_url": "git://github.com/russross/blackfriday.git",
            "ssh_url": "git@github.com:russross/blackfriday.git",
            "clone_url": "https://github.com/russross/blackfriday.git",
            "svn_url": "https://github.com/russross/blackfriday",
            "homepage": "",
            "size": 1163,
            "stargazers_count": 2388,
            "watchers_count": 2388,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 305,
            "mirror_url": null,
            "open_issues_count": 77,
            "forks": 305,
            "open_issues": 77,
            "watchers": 2388,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "russross:master",
          "ref": "master",
          "sha": "b253417e1cb644d645a0a3bb1fa5034c8030127c",
          "user": {
            "login": "russross",
            "id": 65428,
            "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/russross",
            "html_url": "https://github.com/russross",
            "followers_url": "https://api.github.com/users/russross/followers",
            "following_url": "https://api.github.com/users/russross/following{/other_user}",
            "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
            "organizations_url": "https://api.github.com/users/russross/orgs",
            "repos_url": "https://api.github.com/users/russross/repos",
            "events_url": "https://api.github.com/users/russross/events{/privacy}",
            "received_events_url": "https://api.github.com/users/russross/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 1812190,
            "name": "blackfriday",
            "full_name": "russross/blackfriday",
            "owner": {
              "login": "russross",
              "id": 65428,
              "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/russross",
              "html_url": "https://github.com/russross",
              "followers_url": "https://api.github.com/users/russross/followers",
              "following_url": "https://api.github.com/users/russross/following{/other_user}",
              "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
              "organizations_url": "https://api.github.com/users/russross/orgs",
              "repos_url": "https://api.github.com/users/russross/repos",
              "events_url": "https://api.github.com/users/russross/events{/privacy}",
              "received_events_url": "https://api.github.com/users/russross/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/russross/blackfriday",
            "description": "Blackfriday: a markdown processor for Go",
            "fork": false,
            "url": "https://api.github.com/repos/russross/blackfriday",
            "forks_url": "https://api.github.com/repos/russross/blackfriday/forks",
            "keys_url": "https://api.github.com/repos/russross/blackfriday/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/russross/blackfriday/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/russross/blackfriday/teams",
            "hooks_url": "https://api.github.com/repos/russross/blackfriday/hooks",
            "issue_events_url": "https://api.github.com/repos/russross/blackfriday/issues/events{/number}",
            "events_url": "https://api.github.com/repos/russross/blackfriday/events",
            "assignees_url": "https://api.github.com/repos/russross/blackfriday/assignees{/user}",
            "branches_url": "https://api.github.com/repos/russross/blackfriday/branches{/branch}",
            "tags_url": "https://api.github.com/repos/russross/blackfriday/tags",
            "blobs_url": "https://api.github.com/repos/russross/blackfriday/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/russross/blackfriday/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/russross/blackfriday/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/russross/blackfriday/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/russross/blackfriday/languages",
            "stargazers_url": "https://api.github.com/repos/russross/blackfriday/stargazers",
            "contributors_url": "https://api.github.com/repos/russross/blackfriday/contributors",
            "subscribers_url": "https://api.github.com/repos/russross/blackfriday/subscribers",
            "subscription_url": "https://api.github.com/repos/russross/blackfriday/subscription",
            "commits_url": "https://api.github.com/repos/russross/blackfriday/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/russross/blackfriday/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/russross/blackfriday/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/russross/blackfriday/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/russross/blackfriday/contents/{+path}",
            "compare_url": "https://api.github.com/repos/russross/blackfriday/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/russross/blackfriday/merges",
            "archive_url": "https://api.github.com/repos/russross/blackfriday/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/russross/blackfriday/downloads",
            "issues_url": "https://api.github.com/repos/russross/blackfriday/issues{/number}",
            "pulls_url": "https://api.github.com/repos/russross/blackfriday/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/russross/blackfriday/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/russross/blackfriday/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/russross/blackfriday/labels{/name}",
            "releases_url": "https://api.github.com/repos/russross/blackfriday/releases{/id}",
            "deployments_url": "https://api.github.com/repos/russross/blackfriday/deployments",
            "created_at": "2011-05-27T22:28:58Z",
            "updated_at": "2017-05-06T15:59:07Z",
            "pushed_at": "2017-05-06T16:59:52Z",
            "git_url": "git://github.com/russross/blackfriday.git",
            "ssh_url": "git@github.com:russross/blackfriday.git",
            "clone_url": "https://github.com/russross/blackfriday.git",
            "svn_url": "https://github.com/russross/blackfriday",
            "homepage": "",
            "size": 1163,
            "stargazers_count": 2388,
            "watchers_count": 2388,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 305,
            "mirror_url": null,
            "open_issues_count": 77,
            "forks": 305,
            "open_issues": 77,
            "watchers": 2388,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/354"
          },
          "html": {
            "href": "https://github.com/russross/blackfriday/pull/354"
          },
          "issue": {
            "href": "https://api.github.com/repos/russross/blackfriday/issues/354"
          },
          "comments": {
            "href": "https://api.github.com/repos/russross/blackfriday/issues/354/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/354/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/354/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/russross/blackfriday/statuses/aab8b89f4a157c2d6f51d87b8347b66705dc6c81"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-06T17:12:36Z"
  },
  {
    "id": "5822364006",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 14737022,
      "name": "shurcooL/gostatus",
      "url": "https://api.github.com/repos/shurcooL/gostatus"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/shurcooL/gostatus/issues/42",
        "repository_url": "https://api.github.com/repos/shurcooL/gostatus",
        "labels_url": "https://api.github.com/repos/shurcooL/gostatus/issues/42/labels{/name}",
        "comments_url": "https://api.github.com/repos/shurcooL/gostatus/issues/42/comments",
        "events_url": "https://api.github.com/repos/shurcooL/gostatus/issues/42/events",
        "html_url": "https://github.com/shurcooL/gostatus/issues/42",
        "id": 226772561,
        "number": 42,
        "title": "handle version tag",
        "user": {
          "login": "mh-cbon",
          "id": 17096799,
          "avatar_url": "https://avatars0.githubusercontent.com/u/17096799?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/mh-cbon",
          "html_url": "https://github.com/mh-cbon",
          "followers_url": "https://api.github.com/users/mh-cbon/followers",
          "following_url": "https://api.github.com/users/mh-cbon/following{/other_user}",
          "gists_url": "https://api.github.com/users/mh-cbon/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/mh-cbon/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/mh-cbon/subscriptions",
          "organizations_url": "https://api.github.com/users/mh-cbon/orgs",
          "repos_url": "https://api.github.com/users/mh-cbon/repos",
          "events_url": "https://api.github.com/users/mh-cbon/events{/privacy}",
          "received_events_url": "https://api.github.com/users/mh-cbon/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 1,
        "created_at": "2017-05-06T13:51:03Z",
        "updated_at": "2017-05-06T15:01:44Z",
        "closed_at": null,
        "body": "Hi,\r\n\r\nI d like very much it also handles tags \r\nto detect repository that are currently in \r\nRC state such as beta / alpha, \r\nso that i can have better overview of which repo has pending release.\r\n\r\nAs example i have this repo here (https://github.com/mh-cbon/emd/releases)\r\nwith pending release for +10 days, likely i will forget about it if i m into some rush.\r\n\r\nWould a patch using Masterminds/semver suitable for you ?"
      },
      "comment": {
        "url": "https://api.github.com/repos/shurcooL/gostatus/issues/comments/299645465",
        "html_url": "https://github.com/shurcooL/gostatus/issues/42#issuecomment-299645465",
        "issue_url": "https://api.github.com/repos/shurcooL/gostatus/issues/42",
        "id": 299645465,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-06T15:01:44Z",
        "updated_at": "2017-05-06T15:01:44Z",
        "body": "Hi, thanks for proposing this enhancement. I want to understand this better, so I have some questions.\r\n\r\n> I d like very much it also handles tags\r\n> to detect repository that are currently in\r\n> RC state such as beta / alpha,\r\n> so that i can have better overview of which repo has pending release.\r\n\r\nCan you describe it in a little more detail please?\r\n\r\nWhat is beta, alpha and how is that determined from tags?\r\n\r\nGive an example of various repository states, and what you'd want ` + "`" + `gostatus` + "`" + ` to tell you about them.\r\n\r\n> As example i have this repo here (https://github.com/mh-cbon/emd/releases)\r\n> with pending release for +10 days, likely i will forget about it if i m into some rush.\r\n\r\nIs it about the number of commits that are on default branch compared to the latest semver tag? How did you calculate the 10 days number?"
      }
    },
    "public": true,
    "created_at": "2017-05-06T15:01:44Z"
  },
  {
    "id": "5821750401",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 23096959,
      "name": "golang/go",
      "url": "https://api.github.com/repos/golang/go"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/golang/go/issues/20264",
        "repository_url": "https://api.github.com/repos/golang/go",
        "labels_url": "https://api.github.com/repos/golang/go/issues/20264/labels{/name}",
        "comments_url": "https://api.github.com/repos/golang/go/issues/20264/comments",
        "events_url": "https://api.github.com/repos/golang/go/issues/20264/events",
        "html_url": "https://github.com/golang/go/issues/20264",
        "id": 226747687,
        "number": 20264,
        "title": "cmd/go: get and build can interact badly on case-insensitive but case-preserving file systems",
        "user": {
          "login": "josharian",
          "id": 67496,
          "avatar_url": "https://avatars1.githubusercontent.com/u/67496?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/josharian",
          "html_url": "https://github.com/josharian",
          "followers_url": "https://api.github.com/users/josharian/followers",
          "following_url": "https://api.github.com/users/josharian/following{/other_user}",
          "gists_url": "https://api.github.com/users/josharian/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/josharian/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/josharian/subscriptions",
          "organizations_url": "https://api.github.com/users/josharian/orgs",
          "repos_url": "https://api.github.com/users/josharian/repos",
          "events_url": "https://api.github.com/users/josharian/events{/privacy}",
          "received_events_url": "https://api.github.com/users/josharian/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": {
          "url": "https://api.github.com/repos/golang/go/milestones/49",
          "html_url": "https://github.com/golang/go/milestone/49",
          "labels_url": "https://api.github.com/repos/golang/go/milestones/49/labels",
          "id": 2053058,
          "number": 49,
          "title": "Go1.9",
          "description": "",
          "creator": {
            "login": "rsc",
            "id": 104030,
            "avatar_url": "https://avatars2.githubusercontent.com/u/104030?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/rsc",
            "html_url": "https://github.com/rsc",
            "followers_url": "https://api.github.com/users/rsc/followers",
            "following_url": "https://api.github.com/users/rsc/following{/other_user}",
            "gists_url": "https://api.github.com/users/rsc/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/rsc/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/rsc/subscriptions",
            "organizations_url": "https://api.github.com/users/rsc/orgs",
            "repos_url": "https://api.github.com/users/rsc/repos",
            "events_url": "https://api.github.com/users/rsc/events{/privacy}",
            "received_events_url": "https://api.github.com/users/rsc/received_events",
            "type": "User",
            "site_admin": false
          },
          "open_issues": 514,
          "closed_issues": 367,
          "state": "open",
          "created_at": "2016-10-06T18:17:55Z",
          "updated_at": "2017-05-06T07:36:23Z",
          "due_on": "2017-07-31T07:00:00Z",
          "closed_at": null
        },
        "comments": 0,
        "created_at": "2017-05-06T07:36:23Z",
        "updated_at": "2017-05-06T09:10:00Z",
        "closed_at": null,
        "body": "Reproduce, using stock macOS filesystem, which is case-insensitive but case-preserving:\r\n\r\n` + "```" + `bash\r\n$ go get -d github.com/0x263b/Porygon2\r\n$ go build -toolexec=\"toolstash -cmp\" -a -o /dev/null github.com/0x263b/...\r\n` + "```" + `\r\n\r\nResult: Rare object file mismatches in which only a few bytes differ. Even rarer build failures in which we emit corrupt object files.\r\n\r\nThe reason is that ` + "`" + `go get` + "`" + ` downloads the code into ` + "`" + `$GOPATH/src/github.com/0x263b/Porygon2` + "`" + `. ` + "`" + `go build` + "`" + ` then walks ` + "`" + `$GOPATH/src/github.com/0x263b` + "`" + `, and adds the import paths corresponding to the directory names it sees, e.g. ` + "`" + `github.com/0x263b/Porygon2/web` + "`" + `; note the capital ` + "`" + `P` + "`" + `. Then it reads the import paths found in the code, which are lower case, and adds those import paths, including ` + "`" + `github.com/0x263b/porygon2/web` + "`" + `; lower case ` + "`" + `p` + "`" + `.\r\n\r\nThere's a check in ` + "`" + `PackagesForBuild` + "`" + ` for this exact scenario, aptly described in a comment:\r\n\r\n` + "```" + `go\r\n\t// Check for duplicate loads of the same package.\r\n\t// That should be impossible, but if it does happen then\r\n\t// we end up trying to build the same package twice,\r\n\t// usually in parallel overwriting the same files,\r\n\t// which doesn't work very well.\r\n` + "```" + `\r\n\r\nHowever, that check is case-sensitive, so this package sneaks past the check. Making the check do a ` + "`" + `strings.ToLower` + "`" + ` on the package import paths catches it:\r\n\r\n` + "```" + `\r\ninternal error: duplicate loads of github.com/0x263b/porygon2\r\ninternal error: duplicate loads of github.com/0x263b/porygon2/web\r\n` + "```" + `\r\n\r\nThis problem is not theoretical; I just wasted four hours tracking it down, starting from non-deterministic build failures.\r\n\r\nThis seems like a can of worms, and I don't know what the right fix is, but I think we should do something. Input requested.\r\n\r\ncc @rsc @bradfitz @shurcooL \r\n"
      },
      "comment": {
        "url": "https://api.github.com/repos/golang/go/issues/comments/299626927",
        "html_url": "https://github.com/golang/go/issues/20264#issuecomment-299626927",
        "issue_url": "https://api.github.com/repos/golang/go/issues/20264",
        "id": 299626927,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-06T09:10:00Z",
        "updated_at": "2017-05-06T09:10:00Z",
        "body": "Worth noting, in the README, it says:\r\n\r\n` + "```" + `\r\ngo get -u github.com/0x263b/porygon2\r\n` + "```" + `\r\n\r\nSo the canonical import path is meant to be with lower-case p. However, there is no import path comment enforcing that, and it seems there's nothing to stop one from ` + "`" + `go get` + "`" + `ing the unintended case of import path and trying to build that. Especially since the canonical name of the repository is with an upper-case P, so the chance is even higher than usual.\r\n\r\nOne solution that I want to consider is to make it so that import paths should be case sensitive on case-preserving file systems, if that's possible. If you have a package at ` + "`" + `$GOPATH/src/foo` + "`" + ` path, doing ` + "`" + `import \"FOO\"` + "`" + ` should tell you \"FOO\" doesn't exist, even though ` + "`" + `cd $GOPATH/src/FOO` + "`" + ` would work (due to case insensitive filesystem)."
      }
    },
    "public": true,
    "created_at": "2017-05-06T09:10:02Z",
    "org": {
      "id": 4314092,
      "login": "golang",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/golang",
      "avatar_url": "https://avatars.githubusercontent.com/u/4314092?"
    }
  },
  {
    "id": "5821492289",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 15789675,
      "name": "shurcooL/play",
      "url": "https://api.github.com/repos/shurcooL/play"
    },
    "payload": {
      "push_id": 1723146068,
      "size": 5,
      "distinct_size": 5,
      "ref": "refs/heads/master",
      "head": "8de778f888221fa6fc1fe6c8e8140890c73aa942",
      "before": "9ee6a378d9541f5ef9d36b295915bd0818dfdaa9",
      "commits": [
        {
          "sha": "f819182279a894ff83d572dc5ce90f3f37f1eb5c",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Play with various ways of encoding events.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/play/commits/f819182279a894ff83d572dc5ce90f3f37f1eb5c"
        },
        {
          "sha": "ac1d3d173fe9c4661f808a9dc4fc87453039b256",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "WIP: Play with a store for events.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/play/commits/ac1d3d173fe9c4661f808a9dc4fc87453039b256"
        },
        {
          "sha": "be9f70fce6ad684fbad1afa6eaa04ad833075b47",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Play with accessing a notifiations API via authenticated client.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/play/commits/be9f70fce6ad684fbad1afa6eaa04ad833075b47"
        },
        {
          "sha": "74af5859ed7e902faf4e9f3fdbf2b922f3f26563",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Update for API changes.\n\nFixed build.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/play/commits/74af5859ed7e902faf4e9f3fdbf2b922f3f26563"
        },
        {
          "sha": "8de778f888221fa6fc1fe6c8e8140890c73aa942",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Consistently map os.IsPermission(err) to 403 Forbidden.\n\nActually use http.StatusForbidden instead of http.StatusUnauthorized.\nUsing http.StatusUnauthorized with \"403 Forbidden\" error message was an\noversight, as far as I can tell.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/play/commits/8de778f888221fa6fc1fe6c8e8140890c73aa942"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T06:16:30Z"
  },
  {
    "id": "5821491316",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 26150932,
      "name": "shurcooL/gtdo",
      "url": "https://api.github.com/repos/shurcooL/gtdo"
    },
    "payload": {
      "push_id": 1723145639,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "5b537cd348a49e05a32ec1c6d300e1b564463618",
      "before": "36340f2c78756e22f5a4089d892d90898d09a23b",
      "commits": [
        {
          "sha": "5b537cd348a49e05a32ec1c6d300e1b564463618",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Consistently map os.IsPermission(err) to 403 Forbidden.\n\nUsing http.StatusUnauthorized for os.IsPermission error was an\noversight, as far as I can tell.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/gtdo/commits/5b537cd348a49e05a32ec1c6d300e1b564463618"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T06:15:45Z"
  },
  {
    "id": "5821491008",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 16196540,
      "name": "shurcooL/Go-Package-Store",
      "url": "https://api.github.com/repos/shurcooL/Go-Package-Store"
    },
    "payload": {
      "push_id": 1723145514,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "d70def55219bf4eb57e7db276c1753a685199bbe",
      "before": "80b20d3ef4f736a0854074e774b6493448c38b7a",
      "commits": [
        {
          "sha": "d70def55219bf4eb57e7db276c1753a685199bbe",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "cmd/Go-Package-Store: Consistently map os.IsPermission(err) to 403 Forbidden.\n\nActually use http.StatusForbidden instead of http.StatusUnauthorized.\nUsing http.StatusUnauthorized with \"403 Forbidden\" error message was an\noversight, as far as I can tell.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/Go-Package-Store/commits/d70def55219bf4eb57e7db276c1753a685199bbe"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T06:15:31Z"
  },
  {
    "id": "5821462780",
    "type": "DeleteEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 90429725,
      "name": "shurcooL/meetings",
      "url": "https://api.github.com/repos/shurcooL/meetings"
    },
    "payload": {
      "ref": "patch-1",
      "ref_type": "branch",
      "pusher_type": "user"
    },
    "public": true,
    "created_at": "2017-05-06T05:55:42Z"
  },
  {
    "id": "5821424952",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 12418999,
      "name": "gopherjs/gopherjs",
      "url": "https://api.github.com/repos/gopherjs/gopherjs"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/gopherjs/gopherjs/issues/641",
        "repository_url": "https://api.github.com/repos/gopherjs/gopherjs",
        "labels_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/641/labels{/name}",
        "comments_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/641/comments",
        "events_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/641/events",
        "html_url": "https://github.com/gopherjs/gopherjs/issues/641",
        "id": 226275913,
        "number": 641,
        "title": "Syntactic Sugar Proposal: add js.NewObject()",
        "user": {
          "login": "theclapp",
          "id": 2324697,
          "avatar_url": "https://avatars0.githubusercontent.com/u/2324697?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/theclapp",
          "html_url": "https://github.com/theclapp",
          "followers_url": "https://api.github.com/users/theclapp/followers",
          "following_url": "https://api.github.com/users/theclapp/following{/other_user}",
          "gists_url": "https://api.github.com/users/theclapp/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/theclapp/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/theclapp/subscriptions",
          "organizations_url": "https://api.github.com/users/theclapp/orgs",
          "repos_url": "https://api.github.com/users/theclapp/repos",
          "events_url": "https://api.github.com/users/theclapp/events{/privacy}",
          "received_events_url": "https://api.github.com/users/theclapp/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 3,
        "created_at": "2017-05-04T13:11:56Z",
        "updated_at": "2017-05-06T05:28:07Z",
        "closed_at": null,
        "body": "Writing ` + "`" + `js.Global.Get(\"Object\").New()` + "`" + ` everywhere is tedious.  I usually write a ` + "`" + `current_package.NewObject()` + "`" + ` function that does the same.\r\n\r\nI propose adding ` + "`" + `NewObject()` + "`" + ` to the ` + "`" + `js` + "`" + ` package.\r\n\r\nAlternatively: is there a better way around this?  Maybe I should just ` + "`" + `var Object = js.Global.Get(\"Object\")` + "`" + ` in every package and leave it at that?  Then I could say ` + "`" + `Object.New()` + "`" + ` which is even shorter than ` + "`" + `js.NewObject()` + "`" + `\r\n\r\nWhat's your favorite solution to this (admittedly minor) issue?"
      },
      "comment": {
        "url": "https://api.github.com/repos/gopherjs/gopherjs/issues/comments/299617157",
        "html_url": "https://github.com/gopherjs/gopherjs/issues/641#issuecomment-299617157",
        "issue_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/641",
        "id": 299617157,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-06T05:28:07Z",
        "updated_at": "2017-05-06T05:28:07Z",
        "body": "My personal preference is to keep the API surface of ` + "`" + `js` + "`" + ` package as small as possible. It's a special package, so understanding it is important, and it's easier when the package is smaller. The criteria for something being added is usually that it cannot be done outside of ` + "`" + `js` + "`" + ` package. If it can be done outside, then it's probably better to have it outside.\r\n\r\n@neelance and I have already rejected adding anything to ` + "`" + `js` + "`" + ` to deal with checking for presence of key in object, because we found that it was possible to do without adding to ` + "`" + `js` + "`" + ` API. See #621.\r\n\r\nSo I doubt we'd want to add a func just for syntactic shortcut."
      }
    },
    "public": true,
    "created_at": "2017-05-06T05:28:07Z",
    "org": {
      "id": 6654647,
      "login": "gopherjs",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/gopherjs",
      "avatar_url": "https://avatars.githubusercontent.com/u/6654647?"
    }
  },
  {
    "id": "5821417812",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10151943,
      "name": "go-gl/glfw",
      "url": "https://api.github.com/repos/go-gl/glfw"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/go-gl/glfw/pulls/comments/115113469",
        "pull_request_review_id": 36637393,
        "id": 115113469,
        "diff_hunk": "@@ -15,7 +15,7 @@ matrix:\n install:\n   - # Do nothing. This is needed to prevent default install action \"go get -t -v ./...\" from happening here (we want it to happen inside script step).\n script:\n-  - go get -t -v ./v3.2/...\n+  - go get -t -v ./v3.2/... ./v3.3/...\n   - diff -u <(echo -n) <(gofmt -d -s .)\n   - go tool vet .\n-  - go test -v -race ./v3.2/...\n+  - go test -v -race ./v3.2/... ./v3.3/..",
        "path": ".travis.yml",
        "position": 9,
        "original_position": 9,
        "commit_id": "15889b2dccec6fac180cd22ac7a03c37a9316be4",
        "original_commit_id": "15889b2dccec6fac180cd22ac7a03c37a9316be4",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "You're missing a final dot and newline character on this line.",
        "created_at": "2017-05-06T05:22:09Z",
        "updated_at": "2017-05-06T05:22:37Z",
        "html_url": "https://github.com/go-gl/glfw/pull/196#discussion_r115113469",
        "pull_request_url": "https://api.github.com/repos/go-gl/glfw/pulls/196",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/go-gl/glfw/pulls/comments/115113469"
          },
          "html": {
            "href": "https://github.com/go-gl/glfw/pull/196#discussion_r115113469"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/go-gl/glfw/pulls/196"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/go-gl/glfw/pulls/196",
        "id": 118815284,
        "html_url": "https://github.com/go-gl/glfw/pull/196",
        "diff_url": "https://github.com/go-gl/glfw/pull/196.diff",
        "patch_url": "https://github.com/go-gl/glfw/pull/196.patch",
        "issue_url": "https://api.github.com/repos/go-gl/glfw/issues/196",
        "number": 196,
        "state": "open",
        "locked": false,
        "title": "initial add of master branch of glfw v3.3 beta",
        "user": {
          "login": "mattkanwisher",
          "id": 3032,
          "avatar_url": "https://avatars3.githubusercontent.com/u/3032?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/mattkanwisher",
          "html_url": "https://github.com/mattkanwisher",
          "followers_url": "https://api.github.com/users/mattkanwisher/followers",
          "following_url": "https://api.github.com/users/mattkanwisher/following{/other_user}",
          "gists_url": "https://api.github.com/users/mattkanwisher/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/mattkanwisher/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/mattkanwisher/subscriptions",
          "organizations_url": "https://api.github.com/users/mattkanwisher/orgs",
          "repos_url": "https://api.github.com/users/mattkanwisher/repos",
          "events_url": "https://api.github.com/users/mattkanwisher/events{/privacy}",
          "received_events_url": "https://api.github.com/users/mattkanwisher/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "Wanted to have a clean checkout of glfw without any new Apis in initial PR. This has been tested working on Darwin, minor tweaks to linux or windows compiles may need to come in the next PRs.",
        "created_at": "2017-05-03T17:37:40Z",
        "updated_at": "2017-05-06T05:22:37Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "b595a0a70ca5ceaaa2608be86da2222e95044c8c",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/go-gl/glfw/pulls/196/commits",
        "review_comments_url": "https://api.github.com/repos/go-gl/glfw/pulls/196/comments",
        "review_comment_url": "https://api.github.com/repos/go-gl/glfw/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/go-gl/glfw/issues/196/comments",
        "statuses_url": "https://api.github.com/repos/go-gl/glfw/statuses/15889b2dccec6fac180cd22ac7a03c37a9316be4",
        "head": {
          "label": "mattkanwisher:v33",
          "ref": "v33",
          "sha": "15889b2dccec6fac180cd22ac7a03c37a9316be4",
          "user": {
            "login": "mattkanwisher",
            "id": 3032,
            "avatar_url": "https://avatars3.githubusercontent.com/u/3032?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/mattkanwisher",
            "html_url": "https://github.com/mattkanwisher",
            "followers_url": "https://api.github.com/users/mattkanwisher/followers",
            "following_url": "https://api.github.com/users/mattkanwisher/following{/other_user}",
            "gists_url": "https://api.github.com/users/mattkanwisher/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/mattkanwisher/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/mattkanwisher/subscriptions",
            "organizations_url": "https://api.github.com/users/mattkanwisher/orgs",
            "repos_url": "https://api.github.com/users/mattkanwisher/repos",
            "events_url": "https://api.github.com/users/mattkanwisher/events{/privacy}",
            "received_events_url": "https://api.github.com/users/mattkanwisher/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 90174447,
            "name": "glfw",
            "full_name": "mattkanwisher/glfw",
            "owner": {
              "login": "mattkanwisher",
              "id": 3032,
              "avatar_url": "https://avatars3.githubusercontent.com/u/3032?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/mattkanwisher",
              "html_url": "https://github.com/mattkanwisher",
              "followers_url": "https://api.github.com/users/mattkanwisher/followers",
              "following_url": "https://api.github.com/users/mattkanwisher/following{/other_user}",
              "gists_url": "https://api.github.com/users/mattkanwisher/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/mattkanwisher/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/mattkanwisher/subscriptions",
              "organizations_url": "https://api.github.com/users/mattkanwisher/orgs",
              "repos_url": "https://api.github.com/users/mattkanwisher/repos",
              "events_url": "https://api.github.com/users/mattkanwisher/events{/privacy}",
              "received_events_url": "https://api.github.com/users/mattkanwisher/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/mattkanwisher/glfw",
            "description": "Go bindings for GLFW 3",
            "fork": true,
            "url": "https://api.github.com/repos/mattkanwisher/glfw",
            "forks_url": "https://api.github.com/repos/mattkanwisher/glfw/forks",
            "keys_url": "https://api.github.com/repos/mattkanwisher/glfw/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/mattkanwisher/glfw/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/mattkanwisher/glfw/teams",
            "hooks_url": "https://api.github.com/repos/mattkanwisher/glfw/hooks",
            "issue_events_url": "https://api.github.com/repos/mattkanwisher/glfw/issues/events{/number}",
            "events_url": "https://api.github.com/repos/mattkanwisher/glfw/events",
            "assignees_url": "https://api.github.com/repos/mattkanwisher/glfw/assignees{/user}",
            "branches_url": "https://api.github.com/repos/mattkanwisher/glfw/branches{/branch}",
            "tags_url": "https://api.github.com/repos/mattkanwisher/glfw/tags",
            "blobs_url": "https://api.github.com/repos/mattkanwisher/glfw/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/mattkanwisher/glfw/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/mattkanwisher/glfw/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/mattkanwisher/glfw/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/mattkanwisher/glfw/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/mattkanwisher/glfw/languages",
            "stargazers_url": "https://api.github.com/repos/mattkanwisher/glfw/stargazers",
            "contributors_url": "https://api.github.com/repos/mattkanwisher/glfw/contributors",
            "subscribers_url": "https://api.github.com/repos/mattkanwisher/glfw/subscribers",
            "subscription_url": "https://api.github.com/repos/mattkanwisher/glfw/subscription",
            "commits_url": "https://api.github.com/repos/mattkanwisher/glfw/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/mattkanwisher/glfw/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/mattkanwisher/glfw/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/mattkanwisher/glfw/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/mattkanwisher/glfw/contents/{+path}",
            "compare_url": "https://api.github.com/repos/mattkanwisher/glfw/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/mattkanwisher/glfw/merges",
            "archive_url": "https://api.github.com/repos/mattkanwisher/glfw/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/mattkanwisher/glfw/downloads",
            "issues_url": "https://api.github.com/repos/mattkanwisher/glfw/issues{/number}",
            "pulls_url": "https://api.github.com/repos/mattkanwisher/glfw/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/mattkanwisher/glfw/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/mattkanwisher/glfw/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/mattkanwisher/glfw/labels{/name}",
            "releases_url": "https://api.github.com/repos/mattkanwisher/glfw/releases{/id}",
            "deployments_url": "https://api.github.com/repos/mattkanwisher/glfw/deployments",
            "created_at": "2017-05-03T17:16:58Z",
            "updated_at": "2017-05-03T17:17:02Z",
            "pushed_at": "2017-05-04T15:35:59Z",
            "git_url": "git://github.com/mattkanwisher/glfw.git",
            "ssh_url": "git@github.com:mattkanwisher/glfw.git",
            "clone_url": "https://github.com/mattkanwisher/glfw.git",
            "svn_url": "https://github.com/mattkanwisher/glfw",
            "homepage": "",
            "size": 1763,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "C",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "go-gl:master",
          "ref": "master",
          "sha": "45517cf5568747f99bb4b0b4abae9fa3cd5f85ed",
          "user": {
            "login": "go-gl",
            "id": 2505184,
            "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/go-gl",
            "html_url": "https://github.com/go-gl",
            "followers_url": "https://api.github.com/users/go-gl/followers",
            "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
            "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
            "organizations_url": "https://api.github.com/users/go-gl/orgs",
            "repos_url": "https://api.github.com/users/go-gl/repos",
            "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
            "received_events_url": "https://api.github.com/users/go-gl/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 10151943,
            "name": "glfw",
            "full_name": "go-gl/glfw",
            "owner": {
              "login": "go-gl",
              "id": 2505184,
              "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/go-gl",
              "html_url": "https://github.com/go-gl",
              "followers_url": "https://api.github.com/users/go-gl/followers",
              "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
              "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
              "organizations_url": "https://api.github.com/users/go-gl/orgs",
              "repos_url": "https://api.github.com/users/go-gl/repos",
              "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
              "received_events_url": "https://api.github.com/users/go-gl/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/go-gl/glfw",
            "description": "Go bindings for GLFW 3",
            "fork": false,
            "url": "https://api.github.com/repos/go-gl/glfw",
            "forks_url": "https://api.github.com/repos/go-gl/glfw/forks",
            "keys_url": "https://api.github.com/repos/go-gl/glfw/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/go-gl/glfw/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/go-gl/glfw/teams",
            "hooks_url": "https://api.github.com/repos/go-gl/glfw/hooks",
            "issue_events_url": "https://api.github.com/repos/go-gl/glfw/issues/events{/number}",
            "events_url": "https://api.github.com/repos/go-gl/glfw/events",
            "assignees_url": "https://api.github.com/repos/go-gl/glfw/assignees{/user}",
            "branches_url": "https://api.github.com/repos/go-gl/glfw/branches{/branch}",
            "tags_url": "https://api.github.com/repos/go-gl/glfw/tags",
            "blobs_url": "https://api.github.com/repos/go-gl/glfw/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/go-gl/glfw/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/go-gl/glfw/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/go-gl/glfw/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/go-gl/glfw/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/go-gl/glfw/languages",
            "stargazers_url": "https://api.github.com/repos/go-gl/glfw/stargazers",
            "contributors_url": "https://api.github.com/repos/go-gl/glfw/contributors",
            "subscribers_url": "https://api.github.com/repos/go-gl/glfw/subscribers",
            "subscription_url": "https://api.github.com/repos/go-gl/glfw/subscription",
            "commits_url": "https://api.github.com/repos/go-gl/glfw/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/go-gl/glfw/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/go-gl/glfw/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/go-gl/glfw/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/go-gl/glfw/contents/{+path}",
            "compare_url": "https://api.github.com/repos/go-gl/glfw/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/go-gl/glfw/merges",
            "archive_url": "https://api.github.com/repos/go-gl/glfw/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/go-gl/glfw/downloads",
            "issues_url": "https://api.github.com/repos/go-gl/glfw/issues{/number}",
            "pulls_url": "https://api.github.com/repos/go-gl/glfw/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/go-gl/glfw/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/go-gl/glfw/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/go-gl/glfw/labels{/name}",
            "releases_url": "https://api.github.com/repos/go-gl/glfw/releases{/id}",
            "deployments_url": "https://api.github.com/repos/go-gl/glfw/deployments",
            "created_at": "2013-05-19T06:38:45Z",
            "updated_at": "2017-05-05T12:16:33Z",
            "pushed_at": "2017-05-04T15:36:00Z",
            "git_url": "git://github.com/go-gl/glfw.git",
            "ssh_url": "git@github.com:go-gl/glfw.git",
            "clone_url": "https://github.com/go-gl/glfw.git",
            "svn_url": "https://github.com/go-gl/glfw",
            "homepage": "",
            "size": 1334,
            "stargazers_count": 360,
            "watchers_count": 360,
            "language": "C",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 46,
            "mirror_url": null,
            "open_issues_count": 5,
            "forks": 46,
            "open_issues": 5,
            "watchers": 360,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/go-gl/glfw/pulls/196"
          },
          "html": {
            "href": "https://github.com/go-gl/glfw/pull/196"
          },
          "issue": {
            "href": "https://api.github.com/repos/go-gl/glfw/issues/196"
          },
          "comments": {
            "href": "https://api.github.com/repos/go-gl/glfw/issues/196/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/go-gl/glfw/pulls/196/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/go-gl/glfw/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/go-gl/glfw/pulls/196/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/go-gl/glfw/statuses/15889b2dccec6fac180cd22ac7a03c37a9316be4"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-06T05:22:09Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5821415087",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 31184284,
      "name": "kardianos/osext",
      "url": "https://api.github.com/repos/kardianos/osext"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/kardianos/osext/pulls/comments/115113451",
        "pull_request_review_id": 36637374,
        "id": 115113451,
        "diff_hunk": "@@ -16,7 +16,7 @@ import (\n \n func executable() (string, error) {\n \tswitch runtime.GOOS {\n-\tcase \"linux\":\n+\tcase \"linux\",\"android\":",
        "path": "osext_procfs.go",
        "position": 14,
        "original_position": 14,
        "commit_id": "05c9d32bf859b718fcfcb184e118ff8c68fc542d",
        "original_commit_id": "05c9d32bf859b718fcfcb184e118ff8c68fc542d",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "This isn't gofmted.",
        "created_at": "2017-05-06T05:20:42Z",
        "updated_at": "2017-05-06T05:20:42Z",
        "html_url": "https://github.com/kardianos/osext/pull/24#discussion_r115113451",
        "pull_request_url": "https://api.github.com/repos/kardianos/osext/pulls/24",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/kardianos/osext/pulls/comments/115113451"
          },
          "html": {
            "href": "https://github.com/kardianos/osext/pull/24#discussion_r115113451"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/kardianos/osext/pulls/24"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/kardianos/osext/pulls/24",
        "id": 119094813,
        "html_url": "https://github.com/kardianos/osext/pull/24",
        "diff_url": "https://github.com/kardianos/osext/pull/24.diff",
        "patch_url": "https://github.com/kardianos/osext/pull/24.patch",
        "issue_url": "https://api.github.com/repos/kardianos/osext/issues/24",
        "number": 24,
        "state": "open",
        "locked": false,
        "title": "Add android support for proc filesystems",
        "user": {
          "login": "drsirmrpresidentfathercharles",
          "id": 7536966,
          "avatar_url": "https://avatars3.githubusercontent.com/u/7536966?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/drsirmrpresidentfathercharles",
          "html_url": "https://github.com/drsirmrpresidentfathercharles",
          "followers_url": "https://api.github.com/users/drsirmrpresidentfathercharles/followers",
          "following_url": "https://api.github.com/users/drsirmrpresidentfathercharles/following{/other_user}",
          "gists_url": "https://api.github.com/users/drsirmrpresidentfathercharles/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/drsirmrpresidentfathercharles/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/drsirmrpresidentfathercharles/subscriptions",
          "organizations_url": "https://api.github.com/users/drsirmrpresidentfathercharles/orgs",
          "repos_url": "https://api.github.com/users/drsirmrpresidentfathercharles/repos",
          "events_url": "https://api.github.com/users/drsirmrpresidentfathercharles/events{/privacy}",
          "received_events_url": "https://api.github.com/users/drsirmrpresidentfathercharles/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "Added android support to the procfs file. Android uses the same proc filesystem as linux under the hood, and so they should be compatible.",
        "created_at": "2017-05-05T00:53:35Z",
        "updated_at": "2017-05-06T05:20:42Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "903c29173072befdfd1f7c44f50bde41d5fdb73d",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/kardianos/osext/pulls/24/commits",
        "review_comments_url": "https://api.github.com/repos/kardianos/osext/pulls/24/comments",
        "review_comment_url": "https://api.github.com/repos/kardianos/osext/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/kardianos/osext/issues/24/comments",
        "statuses_url": "https://api.github.com/repos/kardianos/osext/statuses/05c9d32bf859b718fcfcb184e118ff8c68fc542d",
        "head": {
          "label": "drsirmrpresidentfathercharles:patch-1",
          "ref": "patch-1",
          "sha": "05c9d32bf859b718fcfcb184e118ff8c68fc542d",
          "user": {
            "login": "drsirmrpresidentfathercharles",
            "id": 7536966,
            "avatar_url": "https://avatars3.githubusercontent.com/u/7536966?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/drsirmrpresidentfathercharles",
            "html_url": "https://github.com/drsirmrpresidentfathercharles",
            "followers_url": "https://api.github.com/users/drsirmrpresidentfathercharles/followers",
            "following_url": "https://api.github.com/users/drsirmrpresidentfathercharles/following{/other_user}",
            "gists_url": "https://api.github.com/users/drsirmrpresidentfathercharles/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/drsirmrpresidentfathercharles/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/drsirmrpresidentfathercharles/subscriptions",
            "organizations_url": "https://api.github.com/users/drsirmrpresidentfathercharles/orgs",
            "repos_url": "https://api.github.com/users/drsirmrpresidentfathercharles/repos",
            "events_url": "https://api.github.com/users/drsirmrpresidentfathercharles/events{/privacy}",
            "received_events_url": "https://api.github.com/users/drsirmrpresidentfathercharles/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 90322448,
            "name": "osext",
            "full_name": "drsirmrpresidentfathercharles/osext",
            "owner": {
              "login": "drsirmrpresidentfathercharles",
              "id": 7536966,
              "avatar_url": "https://avatars3.githubusercontent.com/u/7536966?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/drsirmrpresidentfathercharles",
              "html_url": "https://github.com/drsirmrpresidentfathercharles",
              "followers_url": "https://api.github.com/users/drsirmrpresidentfathercharles/followers",
              "following_url": "https://api.github.com/users/drsirmrpresidentfathercharles/following{/other_user}",
              "gists_url": "https://api.github.com/users/drsirmrpresidentfathercharles/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/drsirmrpresidentfathercharles/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/drsirmrpresidentfathercharles/subscriptions",
              "organizations_url": "https://api.github.com/users/drsirmrpresidentfathercharles/orgs",
              "repos_url": "https://api.github.com/users/drsirmrpresidentfathercharles/repos",
              "events_url": "https://api.github.com/users/drsirmrpresidentfathercharles/events{/privacy}",
              "received_events_url": "https://api.github.com/users/drsirmrpresidentfathercharles/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/drsirmrpresidentfathercharles/osext",
            "description": "Extensions to the standard \"os\" package. Executable and ExecutableFolder.",
            "fork": true,
            "url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext",
            "forks_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/forks",
            "keys_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/teams",
            "hooks_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/hooks",
            "issue_events_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/issues/events{/number}",
            "events_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/events",
            "assignees_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/assignees{/user}",
            "branches_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/branches{/branch}",
            "tags_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/tags",
            "blobs_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/languages",
            "stargazers_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/stargazers",
            "contributors_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/contributors",
            "subscribers_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/subscribers",
            "subscription_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/subscription",
            "commits_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/contents/{+path}",
            "compare_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/merges",
            "archive_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/downloads",
            "issues_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/issues{/number}",
            "pulls_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/labels{/name}",
            "releases_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/releases{/id}",
            "deployments_url": "https://api.github.com/repos/drsirmrpresidentfathercharles/osext/deployments",
            "created_at": "2017-05-05T00:51:29Z",
            "updated_at": "2017-05-05T00:51:30Z",
            "pushed_at": "2017-05-05T00:52:47Z",
            "git_url": "git://github.com/drsirmrpresidentfathercharles/osext.git",
            "ssh_url": "git@github.com:drsirmrpresidentfathercharles/osext.git",
            "clone_url": "https://github.com/drsirmrpresidentfathercharles/osext.git",
            "svn_url": "https://github.com/drsirmrpresidentfathercharles/osext",
            "homepage": null,
            "size": 24,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "Go",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "kardianos:master",
          "ref": "master",
          "sha": "9d302b58e975387d0b4d9be876622c86cefe64be",
          "user": {
            "login": "kardianos",
            "id": 755121,
            "avatar_url": "https://avatars1.githubusercontent.com/u/755121?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/kardianos",
            "html_url": "https://github.com/kardianos",
            "followers_url": "https://api.github.com/users/kardianos/followers",
            "following_url": "https://api.github.com/users/kardianos/following{/other_user}",
            "gists_url": "https://api.github.com/users/kardianos/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/kardianos/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/kardianos/subscriptions",
            "organizations_url": "https://api.github.com/users/kardianos/orgs",
            "repos_url": "https://api.github.com/users/kardianos/repos",
            "events_url": "https://api.github.com/users/kardianos/events{/privacy}",
            "received_events_url": "https://api.github.com/users/kardianos/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 31184284,
            "name": "osext",
            "full_name": "kardianos/osext",
            "owner": {
              "login": "kardianos",
              "id": 755121,
              "avatar_url": "https://avatars1.githubusercontent.com/u/755121?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/kardianos",
              "html_url": "https://github.com/kardianos",
              "followers_url": "https://api.github.com/users/kardianos/followers",
              "following_url": "https://api.github.com/users/kardianos/following{/other_user}",
              "gists_url": "https://api.github.com/users/kardianos/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/kardianos/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/kardianos/subscriptions",
              "organizations_url": "https://api.github.com/users/kardianos/orgs",
              "repos_url": "https://api.github.com/users/kardianos/repos",
              "events_url": "https://api.github.com/users/kardianos/events{/privacy}",
              "received_events_url": "https://api.github.com/users/kardianos/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/kardianos/osext",
            "description": "Extensions to the standard \"os\" package. Executable and ExecutableFolder.",
            "fork": false,
            "url": "https://api.github.com/repos/kardianos/osext",
            "forks_url": "https://api.github.com/repos/kardianos/osext/forks",
            "keys_url": "https://api.github.com/repos/kardianos/osext/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/kardianos/osext/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/kardianos/osext/teams",
            "hooks_url": "https://api.github.com/repos/kardianos/osext/hooks",
            "issue_events_url": "https://api.github.com/repos/kardianos/osext/issues/events{/number}",
            "events_url": "https://api.github.com/repos/kardianos/osext/events",
            "assignees_url": "https://api.github.com/repos/kardianos/osext/assignees{/user}",
            "branches_url": "https://api.github.com/repos/kardianos/osext/branches{/branch}",
            "tags_url": "https://api.github.com/repos/kardianos/osext/tags",
            "blobs_url": "https://api.github.com/repos/kardianos/osext/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/kardianos/osext/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/kardianos/osext/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/kardianos/osext/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/kardianos/osext/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/kardianos/osext/languages",
            "stargazers_url": "https://api.github.com/repos/kardianos/osext/stargazers",
            "contributors_url": "https://api.github.com/repos/kardianos/osext/contributors",
            "subscribers_url": "https://api.github.com/repos/kardianos/osext/subscribers",
            "subscription_url": "https://api.github.com/repos/kardianos/osext/subscription",
            "commits_url": "https://api.github.com/repos/kardianos/osext/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/kardianos/osext/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/kardianos/osext/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/kardianos/osext/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/kardianos/osext/contents/{+path}",
            "compare_url": "https://api.github.com/repos/kardianos/osext/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/kardianos/osext/merges",
            "archive_url": "https://api.github.com/repos/kardianos/osext/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/kardianos/osext/downloads",
            "issues_url": "https://api.github.com/repos/kardianos/osext/issues{/number}",
            "pulls_url": "https://api.github.com/repos/kardianos/osext/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/kardianos/osext/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/kardianos/osext/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/kardianos/osext/labels{/name}",
            "releases_url": "https://api.github.com/repos/kardianos/osext/releases{/id}",
            "deployments_url": "https://api.github.com/repos/kardianos/osext/deployments",
            "created_at": "2015-02-22T22:40:07Z",
            "updated_at": "2017-04-26T21:30:16Z",
            "pushed_at": "2017-05-05T00:53:36Z",
            "git_url": "git://github.com/kardianos/osext.git",
            "ssh_url": "git@github.com:kardianos/osext.git",
            "clone_url": "https://github.com/kardianos/osext.git",
            "svn_url": "https://github.com/kardianos/osext",
            "homepage": null,
            "size": 24,
            "stargazers_count": 257,
            "watchers_count": 257,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 39,
            "mirror_url": null,
            "open_issues_count": 2,
            "forks": 39,
            "open_issues": 2,
            "watchers": 257,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/kardianos/osext/pulls/24"
          },
          "html": {
            "href": "https://github.com/kardianos/osext/pull/24"
          },
          "issue": {
            "href": "https://api.github.com/repos/kardianos/osext/issues/24"
          },
          "comments": {
            "href": "https://api.github.com/repos/kardianos/osext/issues/24/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/kardianos/osext/pulls/24/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/kardianos/osext/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/kardianos/osext/pulls/24/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/kardianos/osext/statuses/05c9d32bf859b718fcfcb184e118ff8c68fc542d"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-06T05:20:42Z"
  },
  {
    "id": "5821412917",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 29993389,
      "name": "campoy/jsonenums",
      "url": "https://api.github.com/repos/campoy/jsonenums"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/campoy/jsonenums/pulls/comments/115113431",
        "pull_request_review_id": 36637351,
        "id": 115113431,
        "diff_hunk": "@@ -0,0 +1,9 @@\n+language: go\n+\n+go:\n+  - 1.7\n+  - 1.8",
        "path": ".travis.yml",
        "position": 5,
        "original_position": 5,
        "commit_id": "2016be4569b422c8027a085395aad8ac5a72b434",
        "original_commit_id": "2016be4569b422c8027a085395aad8ac5a72b434",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "You could target the latest patch versions of each minor version with:\r\n\r\n` + "```" + `YML\r\ngo:\r\n  - 1.7.x\r\n  - 1.8.x\r\n` + "```" + `\r\n\r\nOtherwise you're going to get 1.7(.0), 1.8(.0) instead of 1.7.5, 1.8.1.\r\n\r\nReference: https://docs.travis-ci.com/user/languages/go/#Specifying-a-Go-version-to-use.",
        "created_at": "2017-05-06T05:19:03Z",
        "updated_at": "2017-05-06T05:19:03Z",
        "html_url": "https://github.com/campoy/jsonenums/pull/22#discussion_r115113431",
        "pull_request_url": "https://api.github.com/repos/campoy/jsonenums/pulls/22",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/campoy/jsonenums/pulls/comments/115113431"
          },
          "html": {
            "href": "https://github.com/campoy/jsonenums/pull/22#discussion_r115113431"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/campoy/jsonenums/pulls/22"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/campoy/jsonenums/pulls/22",
        "id": 119041834,
        "html_url": "https://github.com/campoy/jsonenums/pull/22",
        "diff_url": "https://github.com/campoy/jsonenums/pull/22.diff",
        "patch_url": "https://github.com/campoy/jsonenums/pull/22.patch",
        "issue_url": "https://api.github.com/repos/campoy/jsonenums/issues/22",
        "number": 22,
        "state": "closed",
        "locked": false,
        "title": "add travis",
        "user": {
          "login": "campoy",
          "id": 2237452,
          "avatar_url": "https://avatars0.githubusercontent.com/u/2237452?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/campoy",
          "html_url": "https://github.com/campoy",
          "followers_url": "https://api.github.com/users/campoy/followers",
          "following_url": "https://api.github.com/users/campoy/following{/other_user}",
          "gists_url": "https://api.github.com/users/campoy/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/campoy/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/campoy/subscriptions",
          "organizations_url": "https://api.github.com/users/campoy/orgs",
          "repos_url": "https://api.github.com/users/campoy/repos",
          "events_url": "https://api.github.com/users/campoy/events{/privacy}",
          "received_events_url": "https://api.github.com/users/campoy/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "",
        "created_at": "2017-05-04T18:52:44Z",
        "updated_at": "2017-05-06T05:19:03Z",
        "closed_at": "2017-05-04T19:03:15Z",
        "merged_at": "2017-05-04T19:03:15Z",
        "merge_commit_sha": "68db04e922ff8d35d4dd93b50a54617ebea4667d",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/campoy/jsonenums/pulls/22/commits",
        "review_comments_url": "https://api.github.com/repos/campoy/jsonenums/pulls/22/comments",
        "review_comment_url": "https://api.github.com/repos/campoy/jsonenums/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/campoy/jsonenums/issues/22/comments",
        "statuses_url": "https://api.github.com/repos/campoy/jsonenums/statuses/2016be4569b422c8027a085395aad8ac5a72b434",
        "head": {
          "label": "campoy:travis",
          "ref": "travis",
          "sha": "2016be4569b422c8027a085395aad8ac5a72b434",
          "user": {
            "login": "campoy",
            "id": 2237452,
            "avatar_url": "https://avatars0.githubusercontent.com/u/2237452?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/campoy",
            "html_url": "https://github.com/campoy",
            "followers_url": "https://api.github.com/users/campoy/followers",
            "following_url": "https://api.github.com/users/campoy/following{/other_user}",
            "gists_url": "https://api.github.com/users/campoy/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/campoy/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/campoy/subscriptions",
            "organizations_url": "https://api.github.com/users/campoy/orgs",
            "repos_url": "https://api.github.com/users/campoy/repos",
            "events_url": "https://api.github.com/users/campoy/events{/privacy}",
            "received_events_url": "https://api.github.com/users/campoy/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 29993389,
            "name": "jsonenums",
            "full_name": "campoy/jsonenums",
            "owner": {
              "login": "campoy",
              "id": 2237452,
              "avatar_url": "https://avatars0.githubusercontent.com/u/2237452?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/campoy",
              "html_url": "https://github.com/campoy",
              "followers_url": "https://api.github.com/users/campoy/followers",
              "following_url": "https://api.github.com/users/campoy/following{/other_user}",
              "gists_url": "https://api.github.com/users/campoy/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/campoy/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/campoy/subscriptions",
              "organizations_url": "https://api.github.com/users/campoy/orgs",
              "repos_url": "https://api.github.com/users/campoy/repos",
              "events_url": "https://api.github.com/users/campoy/events{/privacy}",
              "received_events_url": "https://api.github.com/users/campoy/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/campoy/jsonenums",
            "description": "This tool is similar to golang.org/x/tools/cmd/stringer but generates MarshalJSON and UnmarshalJSON methods.",
            "fork": false,
            "url": "https://api.github.com/repos/campoy/jsonenums",
            "forks_url": "https://api.github.com/repos/campoy/jsonenums/forks",
            "keys_url": "https://api.github.com/repos/campoy/jsonenums/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/campoy/jsonenums/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/campoy/jsonenums/teams",
            "hooks_url": "https://api.github.com/repos/campoy/jsonenums/hooks",
            "issue_events_url": "https://api.github.com/repos/campoy/jsonenums/issues/events{/number}",
            "events_url": "https://api.github.com/repos/campoy/jsonenums/events",
            "assignees_url": "https://api.github.com/repos/campoy/jsonenums/assignees{/user}",
            "branches_url": "https://api.github.com/repos/campoy/jsonenums/branches{/branch}",
            "tags_url": "https://api.github.com/repos/campoy/jsonenums/tags",
            "blobs_url": "https://api.github.com/repos/campoy/jsonenums/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/campoy/jsonenums/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/campoy/jsonenums/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/campoy/jsonenums/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/campoy/jsonenums/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/campoy/jsonenums/languages",
            "stargazers_url": "https://api.github.com/repos/campoy/jsonenums/stargazers",
            "contributors_url": "https://api.github.com/repos/campoy/jsonenums/contributors",
            "subscribers_url": "https://api.github.com/repos/campoy/jsonenums/subscribers",
            "subscription_url": "https://api.github.com/repos/campoy/jsonenums/subscription",
            "commits_url": "https://api.github.com/repos/campoy/jsonenums/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/campoy/jsonenums/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/campoy/jsonenums/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/campoy/jsonenums/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/campoy/jsonenums/contents/{+path}",
            "compare_url": "https://api.github.com/repos/campoy/jsonenums/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/campoy/jsonenums/merges",
            "archive_url": "https://api.github.com/repos/campoy/jsonenums/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/campoy/jsonenums/downloads",
            "issues_url": "https://api.github.com/repos/campoy/jsonenums/issues{/number}",
            "pulls_url": "https://api.github.com/repos/campoy/jsonenums/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/campoy/jsonenums/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/campoy/jsonenums/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/campoy/jsonenums/labels{/name}",
            "releases_url": "https://api.github.com/repos/campoy/jsonenums/releases{/id}",
            "deployments_url": "https://api.github.com/repos/campoy/jsonenums/deployments",
            "created_at": "2015-01-28T23:18:46Z",
            "updated_at": "2017-04-28T13:03:03Z",
            "pushed_at": "2017-05-06T02:18:29Z",
            "git_url": "git://github.com/campoy/jsonenums.git",
            "ssh_url": "git@github.com:campoy/jsonenums.git",
            "clone_url": "https://github.com/campoy/jsonenums.git",
            "svn_url": "https://github.com/campoy/jsonenums",
            "homepage": null,
            "size": 39,
            "stargazers_count": 257,
            "watchers_count": 257,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 29,
            "mirror_url": null,
            "open_issues_count": 4,
            "forks": 29,
            "open_issues": 4,
            "watchers": 257,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "campoy:master",
          "ref": "master",
          "sha": "ff3de3c0ddce76fd05063b1aeecd4decaa5176ae",
          "user": {
            "login": "campoy",
            "id": 2237452,
            "avatar_url": "https://avatars0.githubusercontent.com/u/2237452?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/campoy",
            "html_url": "https://github.com/campoy",
            "followers_url": "https://api.github.com/users/campoy/followers",
            "following_url": "https://api.github.com/users/campoy/following{/other_user}",
            "gists_url": "https://api.github.com/users/campoy/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/campoy/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/campoy/subscriptions",
            "organizations_url": "https://api.github.com/users/campoy/orgs",
            "repos_url": "https://api.github.com/users/campoy/repos",
            "events_url": "https://api.github.com/users/campoy/events{/privacy}",
            "received_events_url": "https://api.github.com/users/campoy/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 29993389,
            "name": "jsonenums",
            "full_name": "campoy/jsonenums",
            "owner": {
              "login": "campoy",
              "id": 2237452,
              "avatar_url": "https://avatars0.githubusercontent.com/u/2237452?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/campoy",
              "html_url": "https://github.com/campoy",
              "followers_url": "https://api.github.com/users/campoy/followers",
              "following_url": "https://api.github.com/users/campoy/following{/other_user}",
              "gists_url": "https://api.github.com/users/campoy/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/campoy/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/campoy/subscriptions",
              "organizations_url": "https://api.github.com/users/campoy/orgs",
              "repos_url": "https://api.github.com/users/campoy/repos",
              "events_url": "https://api.github.com/users/campoy/events{/privacy}",
              "received_events_url": "https://api.github.com/users/campoy/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/campoy/jsonenums",
            "description": "This tool is similar to golang.org/x/tools/cmd/stringer but generates MarshalJSON and UnmarshalJSON methods.",
            "fork": false,
            "url": "https://api.github.com/repos/campoy/jsonenums",
            "forks_url": "https://api.github.com/repos/campoy/jsonenums/forks",
            "keys_url": "https://api.github.com/repos/campoy/jsonenums/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/campoy/jsonenums/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/campoy/jsonenums/teams",
            "hooks_url": "https://api.github.com/repos/campoy/jsonenums/hooks",
            "issue_events_url": "https://api.github.com/repos/campoy/jsonenums/issues/events{/number}",
            "events_url": "https://api.github.com/repos/campoy/jsonenums/events",
            "assignees_url": "https://api.github.com/repos/campoy/jsonenums/assignees{/user}",
            "branches_url": "https://api.github.com/repos/campoy/jsonenums/branches{/branch}",
            "tags_url": "https://api.github.com/repos/campoy/jsonenums/tags",
            "blobs_url": "https://api.github.com/repos/campoy/jsonenums/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/campoy/jsonenums/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/campoy/jsonenums/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/campoy/jsonenums/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/campoy/jsonenums/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/campoy/jsonenums/languages",
            "stargazers_url": "https://api.github.com/repos/campoy/jsonenums/stargazers",
            "contributors_url": "https://api.github.com/repos/campoy/jsonenums/contributors",
            "subscribers_url": "https://api.github.com/repos/campoy/jsonenums/subscribers",
            "subscription_url": "https://api.github.com/repos/campoy/jsonenums/subscription",
            "commits_url": "https://api.github.com/repos/campoy/jsonenums/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/campoy/jsonenums/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/campoy/jsonenums/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/campoy/jsonenums/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/campoy/jsonenums/contents/{+path}",
            "compare_url": "https://api.github.com/repos/campoy/jsonenums/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/campoy/jsonenums/merges",
            "archive_url": "https://api.github.com/repos/campoy/jsonenums/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/campoy/jsonenums/downloads",
            "issues_url": "https://api.github.com/repos/campoy/jsonenums/issues{/number}",
            "pulls_url": "https://api.github.com/repos/campoy/jsonenums/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/campoy/jsonenums/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/campoy/jsonenums/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/campoy/jsonenums/labels{/name}",
            "releases_url": "https://api.github.com/repos/campoy/jsonenums/releases{/id}",
            "deployments_url": "https://api.github.com/repos/campoy/jsonenums/deployments",
            "created_at": "2015-01-28T23:18:46Z",
            "updated_at": "2017-04-28T13:03:03Z",
            "pushed_at": "2017-05-06T02:18:29Z",
            "git_url": "git://github.com/campoy/jsonenums.git",
            "ssh_url": "git@github.com:campoy/jsonenums.git",
            "clone_url": "https://github.com/campoy/jsonenums.git",
            "svn_url": "https://github.com/campoy/jsonenums",
            "homepage": null,
            "size": 39,
            "stargazers_count": 257,
            "watchers_count": 257,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 29,
            "mirror_url": null,
            "open_issues_count": 4,
            "forks": 29,
            "open_issues": 4,
            "watchers": 257,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/campoy/jsonenums/pulls/22"
          },
          "html": {
            "href": "https://github.com/campoy/jsonenums/pull/22"
          },
          "issue": {
            "href": "https://api.github.com/repos/campoy/jsonenums/issues/22"
          },
          "comments": {
            "href": "https://api.github.com/repos/campoy/jsonenums/issues/22/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/campoy/jsonenums/pulls/22/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/campoy/jsonenums/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/campoy/jsonenums/pulls/22/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/campoy/jsonenums/statuses/2016be4569b422c8027a085395aad8ac5a72b434"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-06T05:19:03Z"
  },
  {
    "id": "5821403066",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930455,
      "name": "shurcooL/reactions",
      "url": "https://api.github.com/repos/shurcooL/reactions"
    },
    "payload": {
      "push_id": 1723111971,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "95ddfcee9781ca147e216252e9980ace7cb3b0bb",
      "before": "bf956202966946725c619aec8ed11e8d88e2de06",
      "commits": [
        {
          "sha": "95ddfcee9781ca147e216252e9980ace7cb3b0bb",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Update for issues/fs API change.\n\nFollows shurcooL/issues@0cd146f6501c4e0bab5d9ca7b55ebf20b97440dc.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/reactions/commits/95ddfcee9781ca147e216252e9980ace7cb3b0bb"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T05:11:20Z"
  },
  {
    "id": "5821400907",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930421,
      "name": "shurcooL/issuesapp",
      "url": "https://api.github.com/repos/shurcooL/issuesapp"
    },
    "payload": {
      "push_id": 1723111212,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "309254ed2e0d85fe84d69acacc6a2fedffd71bde",
      "before": "637efe8d736979dea026fdfc884c45b6e467fe42",
      "commits": [
        {
          "sha": "309254ed2e0d85fe84d69acacc6a2fedffd71bde",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Consistently map os.IsPermission(err) to 403 Forbidden.\n\nUsing http.StatusUnauthorized for os.IsPermission error was an\noversight, as far as I can tell.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/issuesapp/commits/309254ed2e0d85fe84d69acacc6a2fedffd71bde"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T05:09:46Z"
  },
  {
    "id": "5821400154",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930389,
      "name": "shurcooL/notifications",
      "url": "https://api.github.com/repos/shurcooL/notifications"
    },
    "payload": {
      "push_id": 1723110952,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "bfea0cacc70e7a46611089a1d726688988cbfad3",
      "before": "b8609d08f00cb59e20a7171dd53b2dd2fa9baa54",
      "commits": [
        {
          "sha": "bfea0cacc70e7a46611089a1d726688988cbfad3",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Document ExternalService methods.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/notifications/commits/bfea0cacc70e7a46611089a1d726688988cbfad3"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T05:09:06Z"
  },
  {
    "id": "5821399700",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930439,
      "name": "shurcooL/users",
      "url": "https://api.github.com/repos/shurcooL/users"
    },
    "payload": {
      "push_id": 1723110783,
      "size": 2,
      "distinct_size": 2,
      "ref": "refs/heads/master",
      "head": "ab570f41539a314bc4051177cbb40d2e15c22e52",
      "before": "8b2093d8ac362fdba0cdb80c9358515c61af3dd9",
      "commits": [
        {
          "sha": "2fea9da9ba6f05d23a83147a2e5de5cee8452b0a",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "fs: Don't lock mutex in load unneccessarily.\n\nWhen load runs, it's the only place that can access the store\nvariables. There is no race condition. Locking mutex is only needed\nafter the store is returned and its public methods can be called\nconcurrently.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/users/commits/2fea9da9ba6f05d23a83147a2e5de5cee8452b0a"
        },
        {
          "sha": "ab570f41539a314bc4051177cbb40d2e15c22e52",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "fs: Remove unnecessary conversion.\n\nFollows 155c11a29d1e03a3b29f4f9d7068ca7bae9ebc27.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/users/commits/ab570f41539a314bc4051177cbb40d2e15c22e52"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T05:08:41Z"
  },
  {
    "id": "5821391328",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 90435863,
      "name": "shurcooL/events",
      "url": "https://api.github.com/repos/shurcooL/events"
    },
    "payload": {
      "push_id": 1723107992,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "7bd3f7e34a17d49fec4f3be780a3249a993574a8",
      "before": "2a028b0925c41af4c42882ff9fe648a3307804b1",
      "commits": [
        {
          "sha": "7bd3f7e34a17d49fec4f3be780a3249a993574a8",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "githubapi: Reorder ForkEvent to be more logical.\n\nIt was there during development to have a smaller diff.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/events/commits/7bd3f7e34a17d49fec4f3be780a3249a993574a8"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T05:02:42Z"
  },
  {
    "id": "5821390788",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930476,
      "name": "shurcooL/home",
      "url": "https://api.github.com/repos/shurcooL/home"
    },
    "payload": {
      "push_id": 1723107793,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "b48b6f1544337627f81363fc1d7e589a965f3d80",
      "before": "1118998da5e4632e0ca2bb629ea97cd975f1aaa0",
      "commits": [
        {
          "sha": "b48b6f1544337627f81363fc1d7e589a965f3d80",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Reorder event.Fork to be more logical.\n\nIt was there during development to have a smaller diff.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/home/commits/b48b6f1544337627f81363fc1d7e589a965f3d80"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T05:02:18Z"
  },
  {
    "id": "5821381112",
    "type": "DeleteEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930476,
      "name": "shurcooL/home",
      "url": "https://api.github.com/repos/shurcooL/home"
    },
    "payload": {
      "ref": "own-events",
      "ref_type": "branch",
      "pusher_type": "user"
    },
    "public": true,
    "created_at": "2017-05-06T04:55:30Z"
  },
  {
    "id": "5821380989",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930476,
      "name": "shurcooL/home",
      "url": "https://api.github.com/repos/shurcooL/home"
    },
    "payload": {
      "push_id": 1723104138,
      "size": 2,
      "distinct_size": 0,
      "ref": "refs/heads/master",
      "head": "1118998da5e4632e0ca2bb629ea97cd975f1aaa0",
      "before": "46ea901d6af8dc13195066172f75268c138e14f0",
      "commits": [
        {
          "sha": "ed50d0564ddce3895911845793cf830f14edb0e9",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Rename event type to activityEvent.\n\nTo avoid a future name collision with event package.",
          "distinct": false,
          "url": "https://api.github.com/repos/shurcooL/home/commits/ed50d0564ddce3895911845793cf830f14edb0e9"
        },
        {
          "sha": "1118998da5e4632e0ca2bb629ea97cd975f1aaa0",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Factor out events service into separate package.\n\nFollows shurcooL/events@b432740b76b7949e17e264865e3939bb645adea2\nand shurcooL/issues@0cd146f6501c4e0bab5d9ca7b55ebf20b97440dc.",
          "distinct": false,
          "url": "https://api.github.com/repos/shurcooL/home/commits/1118998da5e4632e0ca2bb629ea97cd975f1aaa0"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T04:55:25Z"
  },
  {
    "id": "5821380981",
    "type": "PullRequestEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930476,
      "name": "shurcooL/home",
      "url": "https://api.github.com/repos/shurcooL/home"
    },
    "payload": {
      "action": "closed",
      "number": 9,
      "pull_request": {
        "url": "https://api.github.com/repos/shurcooL/home/pulls/9",
        "id": 119287108,
        "html_url": "https://github.com/shurcooL/home/pull/9",
        "diff_url": "https://github.com/shurcooL/home/pull/9.diff",
        "patch_url": "https://github.com/shurcooL/home/pull/9.patch",
        "issue_url": "https://api.github.com/repos/shurcooL/home/issues/9",
        "number": 9,
        "state": "closed",
        "locked": false,
        "title": "Factor out events service into separate package.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "This is a step forward towards being able to include events from additional sources in the activity stream, not just from GitHub.\r\n\r\nFor now, this is a refactor with not visible change of behavior.",
        "created_at": "2017-05-06T04:52:26Z",
        "updated_at": "2017-05-06T04:55:25Z",
        "closed_at": "2017-05-06T04:55:25Z",
        "merged_at": "2017-05-06T04:55:25Z",
        "merge_commit_sha": "1118998da5e4632e0ca2bb629ea97cd975f1aaa0",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/shurcooL/home/pulls/9/commits",
        "review_comments_url": "https://api.github.com/repos/shurcooL/home/pulls/9/comments",
        "review_comment_url": "https://api.github.com/repos/shurcooL/home/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/shurcooL/home/issues/9/comments",
        "statuses_url": "https://api.github.com/repos/shurcooL/home/statuses/1118998da5e4632e0ca2bb629ea97cd975f1aaa0",
        "head": {
          "label": "shurcooL:own-events",
          "ref": "own-events",
          "sha": "1118998da5e4632e0ca2bb629ea97cd975f1aaa0",
          "user": {
            "login": "shurcooL",
            "id": 1924134,
            "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/shurcooL",
            "html_url": "https://github.com/shurcooL",
            "followers_url": "https://api.github.com/users/shurcooL/followers",
            "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
            "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
            "organizations_url": "https://api.github.com/users/shurcooL/orgs",
            "repos_url": "https://api.github.com/users/shurcooL/repos",
            "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
            "received_events_url": "https://api.github.com/users/shurcooL/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 55930476,
            "name": "home",
            "full_name": "shurcooL/home",
            "owner": {
              "login": "shurcooL",
              "id": 1924134,
              "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/shurcooL",
              "html_url": "https://github.com/shurcooL",
              "followers_url": "https://api.github.com/users/shurcooL/followers",
              "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
              "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
              "organizations_url": "https://api.github.com/users/shurcooL/orgs",
              "repos_url": "https://api.github.com/users/shurcooL/repos",
              "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
              "received_events_url": "https://api.github.com/users/shurcooL/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/shurcooL/home",
            "description": "home is Dmitri Shuralyov's personal website.",
            "fork": false,
            "url": "https://api.github.com/repos/shurcooL/home",
            "forks_url": "https://api.github.com/repos/shurcooL/home/forks",
            "keys_url": "https://api.github.com/repos/shurcooL/home/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/shurcooL/home/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/shurcooL/home/teams",
            "hooks_url": "https://api.github.com/repos/shurcooL/home/hooks",
            "issue_events_url": "https://api.github.com/repos/shurcooL/home/issues/events{/number}",
            "events_url": "https://api.github.com/repos/shurcooL/home/events",
            "assignees_url": "https://api.github.com/repos/shurcooL/home/assignees{/user}",
            "branches_url": "https://api.github.com/repos/shurcooL/home/branches{/branch}",
            "tags_url": "https://api.github.com/repos/shurcooL/home/tags",
            "blobs_url": "https://api.github.com/repos/shurcooL/home/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/shurcooL/home/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/shurcooL/home/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/shurcooL/home/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/shurcooL/home/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/shurcooL/home/languages",
            "stargazers_url": "https://api.github.com/repos/shurcooL/home/stargazers",
            "contributors_url": "https://api.github.com/repos/shurcooL/home/contributors",
            "subscribers_url": "https://api.github.com/repos/shurcooL/home/subscribers",
            "subscription_url": "https://api.github.com/repos/shurcooL/home/subscription",
            "commits_url": "https://api.github.com/repos/shurcooL/home/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/shurcooL/home/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/shurcooL/home/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/shurcooL/home/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/shurcooL/home/contents/{+path}",
            "compare_url": "https://api.github.com/repos/shurcooL/home/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/shurcooL/home/merges",
            "archive_url": "https://api.github.com/repos/shurcooL/home/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/shurcooL/home/downloads",
            "issues_url": "https://api.github.com/repos/shurcooL/home/issues{/number}",
            "pulls_url": "https://api.github.com/repos/shurcooL/home/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/shurcooL/home/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/shurcooL/home/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/shurcooL/home/labels{/name}",
            "releases_url": "https://api.github.com/repos/shurcooL/home/releases{/id}",
            "deployments_url": "https://api.github.com/repos/shurcooL/home/deployments",
            "created_at": "2016-04-11T00:41:26Z",
            "updated_at": "2017-04-14T23:33:32Z",
            "pushed_at": "2017-05-06T04:55:24Z",
            "git_url": "git://github.com/shurcooL/home.git",
            "ssh_url": "git@github.com:shurcooL/home.git",
            "clone_url": "https://github.com/shurcooL/home.git",
            "svn_url": "https://github.com/shurcooL/home",
            "homepage": "https://dmitri.shuralyov.com",
            "size": 47869,
            "stargazers_count": 4,
            "watchers_count": 4,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 1,
            "forks": 0,
            "open_issues": 1,
            "watchers": 4,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "shurcooL:master",
          "ref": "master",
          "sha": "46ea901d6af8dc13195066172f75268c138e14f0",
          "user": {
            "login": "shurcooL",
            "id": 1924134,
            "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/shurcooL",
            "html_url": "https://github.com/shurcooL",
            "followers_url": "https://api.github.com/users/shurcooL/followers",
            "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
            "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
            "organizations_url": "https://api.github.com/users/shurcooL/orgs",
            "repos_url": "https://api.github.com/users/shurcooL/repos",
            "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
            "received_events_url": "https://api.github.com/users/shurcooL/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 55930476,
            "name": "home",
            "full_name": "shurcooL/home",
            "owner": {
              "login": "shurcooL",
              "id": 1924134,
              "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/shurcooL",
              "html_url": "https://github.com/shurcooL",
              "followers_url": "https://api.github.com/users/shurcooL/followers",
              "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
              "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
              "organizations_url": "https://api.github.com/users/shurcooL/orgs",
              "repos_url": "https://api.github.com/users/shurcooL/repos",
              "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
              "received_events_url": "https://api.github.com/users/shurcooL/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/shurcooL/home",
            "description": "home is Dmitri Shuralyov's personal website.",
            "fork": false,
            "url": "https://api.github.com/repos/shurcooL/home",
            "forks_url": "https://api.github.com/repos/shurcooL/home/forks",
            "keys_url": "https://api.github.com/repos/shurcooL/home/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/shurcooL/home/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/shurcooL/home/teams",
            "hooks_url": "https://api.github.com/repos/shurcooL/home/hooks",
            "issue_events_url": "https://api.github.com/repos/shurcooL/home/issues/events{/number}",
            "events_url": "https://api.github.com/repos/shurcooL/home/events",
            "assignees_url": "https://api.github.com/repos/shurcooL/home/assignees{/user}",
            "branches_url": "https://api.github.com/repos/shurcooL/home/branches{/branch}",
            "tags_url": "https://api.github.com/repos/shurcooL/home/tags",
            "blobs_url": "https://api.github.com/repos/shurcooL/home/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/shurcooL/home/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/shurcooL/home/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/shurcooL/home/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/shurcooL/home/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/shurcooL/home/languages",
            "stargazers_url": "https://api.github.com/repos/shurcooL/home/stargazers",
            "contributors_url": "https://api.github.com/repos/shurcooL/home/contributors",
            "subscribers_url": "https://api.github.com/repos/shurcooL/home/subscribers",
            "subscription_url": "https://api.github.com/repos/shurcooL/home/subscription",
            "commits_url": "https://api.github.com/repos/shurcooL/home/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/shurcooL/home/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/shurcooL/home/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/shurcooL/home/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/shurcooL/home/contents/{+path}",
            "compare_url": "https://api.github.com/repos/shurcooL/home/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/shurcooL/home/merges",
            "archive_url": "https://api.github.com/repos/shurcooL/home/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/shurcooL/home/downloads",
            "issues_url": "https://api.github.com/repos/shurcooL/home/issues{/number}",
            "pulls_url": "https://api.github.com/repos/shurcooL/home/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/shurcooL/home/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/shurcooL/home/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/shurcooL/home/labels{/name}",
            "releases_url": "https://api.github.com/repos/shurcooL/home/releases{/id}",
            "deployments_url": "https://api.github.com/repos/shurcooL/home/deployments",
            "created_at": "2016-04-11T00:41:26Z",
            "updated_at": "2017-04-14T23:33:32Z",
            "pushed_at": "2017-05-06T04:55:24Z",
            "git_url": "git://github.com/shurcooL/home.git",
            "ssh_url": "git@github.com:shurcooL/home.git",
            "clone_url": "https://github.com/shurcooL/home.git",
            "svn_url": "https://github.com/shurcooL/home",
            "homepage": "https://dmitri.shuralyov.com",
            "size": 47869,
            "stargazers_count": 4,
            "watchers_count": 4,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 1,
            "forks": 0,
            "open_issues": 1,
            "watchers": 4,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/shurcooL/home/pulls/9"
          },
          "html": {
            "href": "https://github.com/shurcooL/home/pull/9"
          },
          "issue": {
            "href": "https://api.github.com/repos/shurcooL/home/issues/9"
          },
          "comments": {
            "href": "https://api.github.com/repos/shurcooL/home/issues/9/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/shurcooL/home/pulls/9/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/shurcooL/home/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/shurcooL/home/pulls/9/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/shurcooL/home/statuses/1118998da5e4632e0ca2bb629ea97cd975f1aaa0"
          }
        },
        "merged": true,
        "mergeable": null,
        "rebaseable": null,
        "mergeable_state": "unknown",
        "merged_by": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "comments": 0,
        "review_comments": 0,
        "maintainer_can_modify": false,
        "commits": 2,
        "additions": 157,
        "deletions": 284,
        "changed_files": 6
      }
    },
    "public": true,
    "created_at": "2017-05-06T04:55:25Z"
  },
  {
    "id": "5821376997",
    "type": "PullRequestEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930476,
      "name": "shurcooL/home",
      "url": "https://api.github.com/repos/shurcooL/home"
    },
    "payload": {
      "action": "opened",
      "number": 9,
      "pull_request": {
        "url": "https://api.github.com/repos/shurcooL/home/pulls/9",
        "id": 119287108,
        "html_url": "https://github.com/shurcooL/home/pull/9",
        "diff_url": "https://github.com/shurcooL/home/pull/9.diff",
        "patch_url": "https://github.com/shurcooL/home/pull/9.patch",
        "issue_url": "https://api.github.com/repos/shurcooL/home/issues/9",
        "number": 9,
        "state": "open",
        "locked": false,
        "title": "Factor out events service into separate package.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "This is a step forward towards being able to include events from additional sources in the activity stream, not just from GitHub.\r\n\r\nFor now, this is a refactor with not visible change of behavior.",
        "created_at": "2017-05-06T04:52:26Z",
        "updated_at": "2017-05-06T04:52:26Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": null,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/shurcooL/home/pulls/9/commits",
        "review_comments_url": "https://api.github.com/repos/shurcooL/home/pulls/9/comments",
        "review_comment_url": "https://api.github.com/repos/shurcooL/home/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/shurcooL/home/issues/9/comments",
        "statuses_url": "https://api.github.com/repos/shurcooL/home/statuses/1118998da5e4632e0ca2bb629ea97cd975f1aaa0",
        "head": {
          "label": "shurcooL:own-events",
          "ref": "own-events",
          "sha": "1118998da5e4632e0ca2bb629ea97cd975f1aaa0",
          "user": {
            "login": "shurcooL",
            "id": 1924134,
            "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/shurcooL",
            "html_url": "https://github.com/shurcooL",
            "followers_url": "https://api.github.com/users/shurcooL/followers",
            "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
            "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
            "organizations_url": "https://api.github.com/users/shurcooL/orgs",
            "repos_url": "https://api.github.com/users/shurcooL/repos",
            "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
            "received_events_url": "https://api.github.com/users/shurcooL/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 55930476,
            "name": "home",
            "full_name": "shurcooL/home",
            "owner": {
              "login": "shurcooL",
              "id": 1924134,
              "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/shurcooL",
              "html_url": "https://github.com/shurcooL",
              "followers_url": "https://api.github.com/users/shurcooL/followers",
              "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
              "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
              "organizations_url": "https://api.github.com/users/shurcooL/orgs",
              "repos_url": "https://api.github.com/users/shurcooL/repos",
              "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
              "received_events_url": "https://api.github.com/users/shurcooL/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/shurcooL/home",
            "description": "home is Dmitri Shuralyov's personal website.",
            "fork": false,
            "url": "https://api.github.com/repos/shurcooL/home",
            "forks_url": "https://api.github.com/repos/shurcooL/home/forks",
            "keys_url": "https://api.github.com/repos/shurcooL/home/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/shurcooL/home/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/shurcooL/home/teams",
            "hooks_url": "https://api.github.com/repos/shurcooL/home/hooks",
            "issue_events_url": "https://api.github.com/repos/shurcooL/home/issues/events{/number}",
            "events_url": "https://api.github.com/repos/shurcooL/home/events",
            "assignees_url": "https://api.github.com/repos/shurcooL/home/assignees{/user}",
            "branches_url": "https://api.github.com/repos/shurcooL/home/branches{/branch}",
            "tags_url": "https://api.github.com/repos/shurcooL/home/tags",
            "blobs_url": "https://api.github.com/repos/shurcooL/home/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/shurcooL/home/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/shurcooL/home/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/shurcooL/home/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/shurcooL/home/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/shurcooL/home/languages",
            "stargazers_url": "https://api.github.com/repos/shurcooL/home/stargazers",
            "contributors_url": "https://api.github.com/repos/shurcooL/home/contributors",
            "subscribers_url": "https://api.github.com/repos/shurcooL/home/subscribers",
            "subscription_url": "https://api.github.com/repos/shurcooL/home/subscription",
            "commits_url": "https://api.github.com/repos/shurcooL/home/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/shurcooL/home/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/shurcooL/home/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/shurcooL/home/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/shurcooL/home/contents/{+path}",
            "compare_url": "https://api.github.com/repos/shurcooL/home/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/shurcooL/home/merges",
            "archive_url": "https://api.github.com/repos/shurcooL/home/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/shurcooL/home/downloads",
            "issues_url": "https://api.github.com/repos/shurcooL/home/issues{/number}",
            "pulls_url": "https://api.github.com/repos/shurcooL/home/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/shurcooL/home/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/shurcooL/home/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/shurcooL/home/labels{/name}",
            "releases_url": "https://api.github.com/repos/shurcooL/home/releases{/id}",
            "deployments_url": "https://api.github.com/repos/shurcooL/home/deployments",
            "created_at": "2016-04-11T00:41:26Z",
            "updated_at": "2017-04-14T23:33:32Z",
            "pushed_at": "2017-05-06T04:50:47Z",
            "git_url": "git://github.com/shurcooL/home.git",
            "ssh_url": "git@github.com:shurcooL/home.git",
            "clone_url": "https://github.com/shurcooL/home.git",
            "svn_url": "https://github.com/shurcooL/home",
            "homepage": "https://dmitri.shuralyov.com",
            "size": 47869,
            "stargazers_count": 4,
            "watchers_count": 4,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 2,
            "forks": 0,
            "open_issues": 2,
            "watchers": 4,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "shurcooL:master",
          "ref": "master",
          "sha": "46ea901d6af8dc13195066172f75268c138e14f0",
          "user": {
            "login": "shurcooL",
            "id": 1924134,
            "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/shurcooL",
            "html_url": "https://github.com/shurcooL",
            "followers_url": "https://api.github.com/users/shurcooL/followers",
            "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
            "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
            "organizations_url": "https://api.github.com/users/shurcooL/orgs",
            "repos_url": "https://api.github.com/users/shurcooL/repos",
            "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
            "received_events_url": "https://api.github.com/users/shurcooL/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 55930476,
            "name": "home",
            "full_name": "shurcooL/home",
            "owner": {
              "login": "shurcooL",
              "id": 1924134,
              "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/shurcooL",
              "html_url": "https://github.com/shurcooL",
              "followers_url": "https://api.github.com/users/shurcooL/followers",
              "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
              "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
              "organizations_url": "https://api.github.com/users/shurcooL/orgs",
              "repos_url": "https://api.github.com/users/shurcooL/repos",
              "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
              "received_events_url": "https://api.github.com/users/shurcooL/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/shurcooL/home",
            "description": "home is Dmitri Shuralyov's personal website.",
            "fork": false,
            "url": "https://api.github.com/repos/shurcooL/home",
            "forks_url": "https://api.github.com/repos/shurcooL/home/forks",
            "keys_url": "https://api.github.com/repos/shurcooL/home/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/shurcooL/home/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/shurcooL/home/teams",
            "hooks_url": "https://api.github.com/repos/shurcooL/home/hooks",
            "issue_events_url": "https://api.github.com/repos/shurcooL/home/issues/events{/number}",
            "events_url": "https://api.github.com/repos/shurcooL/home/events",
            "assignees_url": "https://api.github.com/repos/shurcooL/home/assignees{/user}",
            "branches_url": "https://api.github.com/repos/shurcooL/home/branches{/branch}",
            "tags_url": "https://api.github.com/repos/shurcooL/home/tags",
            "blobs_url": "https://api.github.com/repos/shurcooL/home/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/shurcooL/home/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/shurcooL/home/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/shurcooL/home/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/shurcooL/home/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/shurcooL/home/languages",
            "stargazers_url": "https://api.github.com/repos/shurcooL/home/stargazers",
            "contributors_url": "https://api.github.com/repos/shurcooL/home/contributors",
            "subscribers_url": "https://api.github.com/repos/shurcooL/home/subscribers",
            "subscription_url": "https://api.github.com/repos/shurcooL/home/subscription",
            "commits_url": "https://api.github.com/repos/shurcooL/home/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/shurcooL/home/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/shurcooL/home/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/shurcooL/home/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/shurcooL/home/contents/{+path}",
            "compare_url": "https://api.github.com/repos/shurcooL/home/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/shurcooL/home/merges",
            "archive_url": "https://api.github.com/repos/shurcooL/home/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/shurcooL/home/downloads",
            "issues_url": "https://api.github.com/repos/shurcooL/home/issues{/number}",
            "pulls_url": "https://api.github.com/repos/shurcooL/home/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/shurcooL/home/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/shurcooL/home/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/shurcooL/home/labels{/name}",
            "releases_url": "https://api.github.com/repos/shurcooL/home/releases{/id}",
            "deployments_url": "https://api.github.com/repos/shurcooL/home/deployments",
            "created_at": "2016-04-11T00:41:26Z",
            "updated_at": "2017-04-14T23:33:32Z",
            "pushed_at": "2017-05-06T04:50:47Z",
            "git_url": "git://github.com/shurcooL/home.git",
            "ssh_url": "git@github.com:shurcooL/home.git",
            "clone_url": "https://github.com/shurcooL/home.git",
            "svn_url": "https://github.com/shurcooL/home",
            "homepage": "https://dmitri.shuralyov.com",
            "size": 47869,
            "stargazers_count": 4,
            "watchers_count": 4,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 2,
            "forks": 0,
            "open_issues": 2,
            "watchers": 4,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/shurcooL/home/pulls/9"
          },
          "html": {
            "href": "https://github.com/shurcooL/home/pull/9"
          },
          "issue": {
            "href": "https://api.github.com/repos/shurcooL/home/issues/9"
          },
          "comments": {
            "href": "https://api.github.com/repos/shurcooL/home/issues/9/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/shurcooL/home/pulls/9/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/shurcooL/home/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/shurcooL/home/pulls/9/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/shurcooL/home/statuses/1118998da5e4632e0ca2bb629ea97cd975f1aaa0"
          }
        },
        "merged": false,
        "mergeable": null,
        "rebaseable": null,
        "mergeable_state": "unknown",
        "merged_by": null,
        "comments": 0,
        "review_comments": 0,
        "maintainer_can_modify": false,
        "commits": 2,
        "additions": 157,
        "deletions": 284,
        "changed_files": 6
      }
    },
    "public": true,
    "created_at": "2017-05-06T04:52:26Z"
  },
  {
    "id": "5821374790",
    "type": "CreateEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930476,
      "name": "shurcooL/home",
      "url": "https://api.github.com/repos/shurcooL/home"
    },
    "payload": {
      "ref": "own-events",
      "ref_type": "branch",
      "master_branch": "master",
      "description": "home is Dmitri Shuralyov's personal website.",
      "pusher_type": "user"
    },
    "public": true,
    "created_at": "2017-05-06T04:50:47Z"
  },
  {
    "id": "5821370800",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930382,
      "name": "shurcooL/issues",
      "url": "https://api.github.com/repos/shurcooL/issues"
    },
    "payload": {
      "push_id": 1723100328,
      "size": 2,
      "distinct_size": 2,
      "ref": "refs/heads/master",
      "head": "0cd146f6501c4e0bab5d9ca7b55ebf20b97440dc",
      "before": "37dad5499b36e92efe38b98e92f99cf08a8ab28a",
      "commits": [
        {
          "sha": "d5393ac319e3a33022701a2e31007bac05765c81",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "fs: Minor cleanup.\n\nFactor out htmlURL into a helper func. It'll be used in more places.\n\nUse event.CreatedAt as canonical source of event time, rather than a\nduplicate createdAt variable that wasn't used everywhere.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/issues/commits/d5393ac319e3a33022701a2e31007bac05765c81"
        },
        {
          "sha": "0cd146f6501c4e0bab5d9ca7b55ebf20b97440dc",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "fs: Add support for logging events.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/issues/commits/0cd146f6501c4e0bab5d9ca7b55ebf20b97440dc"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T04:47:59Z"
  },
  {
    "id": "5821336587",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 90435863,
      "name": "shurcooL/events",
      "url": "https://api.github.com/repos/shurcooL/events"
    },
    "payload": {
      "push_id": 1723087468,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "2a028b0925c41af4c42882ff9fe648a3307804b1",
      "before": "b432740b76b7949e17e264865e3939bb645adea2",
      "commits": [
        {
          "sha": "2a028b0925c41af4c42882ff9fe648a3307804b1",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "fs: Improve internal comment.\n\nIt was actually reverse chronological order, but use simpler language.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/events/commits/2a028b0925c41af4c42882ff9fe648a3307804b1"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T04:21:45Z"
  },
  {
    "id": "5821318405",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 90435863,
      "name": "shurcooL/events",
      "url": "https://api.github.com/repos/shurcooL/events"
    },
    "payload": {
      "push_id": 1723080910,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "b432740b76b7949e17e264865e3939bb645adea2",
      "before": "51ab7d5c6a683630a74e65b3836c58a028cfbe1a",
      "commits": [
        {
          "sha": "b432740b76b7949e17e264865e3939bb645adea2",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Initial commit.\n\nAdd githubapi implementation from home.\n\nBegin fs implementation.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/events/commits/b432740b76b7949e17e264865e3939bb645adea2"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T04:07:55Z"
  },
  {
    "id": "5821316719",
    "type": "CreateEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 90435863,
      "name": "shurcooL/events",
      "url": "https://api.github.com/repos/shurcooL/events"
    },
    "payload": {
      "ref": "master",
      "ref_type": "branch",
      "master_branch": "master",
      "description": "Package events provides an events service definition.",
      "pusher_type": "user"
    },
    "public": true,
    "created_at": "2017-05-06T04:06:37Z"
  },
  {
    "id": "5821299973",
    "type": "CreateEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 90435863,
      "name": "shurcooL/events",
      "url": "https://api.github.com/repos/shurcooL/events"
    },
    "payload": {
      "ref": null,
      "ref_type": "repository",
      "master_branch": "master",
      "description": "Package events provides an events service definition.",
      "pusher_type": "user"
    },
    "public": true,
    "created_at": "2017-05-06T03:55:49Z"
  },
  {
    "id": "5821105354",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10270722,
      "name": "google/go-github",
      "url": "https://api.github.com/repos/google/go-github"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/google/go-github/issues/580",
        "repository_url": "https://api.github.com/repos/google/go-github",
        "labels_url": "https://api.github.com/repos/google/go-github/issues/580/labels{/name}",
        "comments_url": "https://api.github.com/repos/google/go-github/issues/580/comments",
        "events_url": "https://api.github.com/repos/google/go-github/issues/580/events",
        "html_url": "https://github.com/google/go-github/pull/580",
        "id": 212005301,
        "number": 580,
        "title": "Retains ability to add users directly as collaborators",
        "user": {
          "login": "alindeman",
          "id": 395621,
          "avatar_url": "https://avatars1.githubusercontent.com/u/395621?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/alindeman",
          "html_url": "https://github.com/alindeman",
          "followers_url": "https://api.github.com/users/alindeman/followers",
          "following_url": "https://api.github.com/users/alindeman/following{/other_user}",
          "gists_url": "https://api.github.com/users/alindeman/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/alindeman/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/alindeman/subscriptions",
          "organizations_url": "https://api.github.com/users/alindeman/orgs",
          "repos_url": "https://api.github.com/users/alindeman/repos",
          "events_url": "https://api.github.com/users/alindeman/events{/privacy}",
          "received_events_url": "https://api.github.com/users/alindeman/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 513231558,
            "url": "https://api.github.com/repos/google/go-github/labels/waiting%20for%20reply",
            "name": "waiting for reply",
            "color": "5319e7",
            "default": false
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 4,
        "created_at": "2017-03-06T01:50:11Z",
        "updated_at": "2017-05-06T01:51:26Z",
        "closed_at": null,
        "pull_request": {
          "url": "https://api.github.com/repos/google/go-github/pulls/580",
          "html_url": "https://github.com/google/go-github/pull/580",
          "diff_url": "https://github.com/google/go-github/pull/580.diff",
          "patch_url": "https://github.com/google/go-github/pull/580.patch"
        },
        "body": "GitHub is previewing a media type that [sends invitations instead of directly adding collaborators](https://developer.github.com/v3/repos/collaborators/#add-user-as-a-collaborator).\r\n\r\nCurrently ` + "`" + `go-github` + "`" + ` always sends the preview header, but I think we should retain the ability to add a collaborator directly because this header is a fundamental behavior change--rather than a typical preview which enables new functionality or sends back additional information.\r\n\r\nConcretely, the change to always use the preview header is affecting my ability to upgrade ` + "`" + `go-github` + "`" + ` in the [terraform](https://github.com/hashicorp/terraform) project without changing the behavior of the ` + "`" + `github_repository_collaborator` + "`" + ` resource. In the version that's currently vendored, the preview header is not sent, meaning the user is added directly. If I upgrade go-github to get access to new (unrelated) functionality, I fundamentally change how an unrelated resource works.\r\n\r\nI think eventually programs like terraform will need to switch to using invitations, but I propose the old functionality continue to be exposed in ` + "`" + `go-github` + "`" + ` since, in fact, the GitHub API itself still supports it."
      },
      "comment": {
        "url": "https://api.github.com/repos/google/go-github/issues/comments/299608384",
        "html_url": "https://github.com/google/go-github/pull/580#issuecomment-299608384",
        "issue_url": "https://api.github.com/repos/google/go-github/issues/580",
        "id": 299608384,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-06T01:51:26Z",
        "updated_at": "2017-05-06T01:51:26Z",
        "body": "An important update on this subject.\r\n\r\nhttps://developer.github.com/changes/2017-05-05-end-repository-invitation-preview/\r\n\r\n> We're making the Repository Invitation API part of the official GitHub API on June 26, 2017. This will be a breaking change to the API and the API endpoint for directly adding a collaborator to a repository. **You will no longer be able to directly add a user to a repository.** Instead, the user will receive an invitation, which they can accept or decline via email, notification, or API endpoint.\r\n\r\nIf I understand the situation correctly, it means there's no point in merging this PR, since it is now confirmed to become non-functional in the near future.\r\n\r\nThose who still want to take advantage of the ability to invite directly, instead of sending an invite, can vendor an older version of go-github, a fork, or custom code (but it'll stop working on June 26 anyway). Does that sound reasonable?"
      }
    },
    "public": true,
    "created_at": "2017-05-06T01:51:26Z",
    "org": {
      "id": 1342004,
      "login": "google",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/google",
      "avatar_url": "https://avatars.githubusercontent.com/u/1342004?"
    }
  },
  {
    "id": "5821088859",
    "type": "PullRequestEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 90221822,
      "name": "WebAssembly/meetings",
      "url": "https://api.github.com/repos/WebAssembly/meetings"
    },
    "payload": {
      "action": "opened",
      "number": 1,
      "pull_request": {
        "url": "https://api.github.com/repos/WebAssembly/meetings/pulls/1",
        "id": 119282654,
        "html_url": "https://github.com/WebAssembly/meetings/pull/1",
        "diff_url": "https://github.com/WebAssembly/meetings/pull/1.diff",
        "patch_url": "https://github.com/WebAssembly/meetings/pull/1.patch",
        "issue_url": "https://api.github.com/repos/WebAssembly/meetings/issues/1",
        "number": 1,
        "state": "open",
        "locked": false,
        "title": "Fix typo in README.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "s/adn/and",
        "created_at": "2017-05-06T01:42:02Z",
        "updated_at": "2017-05-06T01:42:02Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": null,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/WebAssembly/meetings/pulls/1/commits",
        "review_comments_url": "https://api.github.com/repos/WebAssembly/meetings/pulls/1/comments",
        "review_comment_url": "https://api.github.com/repos/WebAssembly/meetings/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/WebAssembly/meetings/issues/1/comments",
        "statuses_url": "https://api.github.com/repos/WebAssembly/meetings/statuses/9a38ceb00af8a4a90c25b999f72b5eb189918c2e",
        "head": {
          "label": "shurcooL:patch-1",
          "ref": "patch-1",
          "sha": "9a38ceb00af8a4a90c25b999f72b5eb189918c2e",
          "user": {
            "login": "shurcooL",
            "id": 1924134,
            "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/shurcooL",
            "html_url": "https://github.com/shurcooL",
            "followers_url": "https://api.github.com/users/shurcooL/followers",
            "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
            "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
            "organizations_url": "https://api.github.com/users/shurcooL/orgs",
            "repos_url": "https://api.github.com/users/shurcooL/repos",
            "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
            "received_events_url": "https://api.github.com/users/shurcooL/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 90429725,
            "name": "meetings",
            "full_name": "shurcooL/meetings",
            "owner": {
              "login": "shurcooL",
              "id": 1924134,
              "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/shurcooL",
              "html_url": "https://github.com/shurcooL",
              "followers_url": "https://api.github.com/users/shurcooL/followers",
              "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
              "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
              "organizations_url": "https://api.github.com/users/shurcooL/orgs",
              "repos_url": "https://api.github.com/users/shurcooL/repos",
              "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
              "received_events_url": "https://api.github.com/users/shurcooL/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/shurcooL/meetings",
            "description": "Information on in-person WebAssembly meetings",
            "fork": true,
            "url": "https://api.github.com/repos/shurcooL/meetings",
            "forks_url": "https://api.github.com/repos/shurcooL/meetings/forks",
            "keys_url": "https://api.github.com/repos/shurcooL/meetings/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/shurcooL/meetings/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/shurcooL/meetings/teams",
            "hooks_url": "https://api.github.com/repos/shurcooL/meetings/hooks",
            "issue_events_url": "https://api.github.com/repos/shurcooL/meetings/issues/events{/number}",
            "events_url": "https://api.github.com/repos/shurcooL/meetings/events",
            "assignees_url": "https://api.github.com/repos/shurcooL/meetings/assignees{/user}",
            "branches_url": "https://api.github.com/repos/shurcooL/meetings/branches{/branch}",
            "tags_url": "https://api.github.com/repos/shurcooL/meetings/tags",
            "blobs_url": "https://api.github.com/repos/shurcooL/meetings/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/shurcooL/meetings/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/shurcooL/meetings/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/shurcooL/meetings/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/shurcooL/meetings/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/shurcooL/meetings/languages",
            "stargazers_url": "https://api.github.com/repos/shurcooL/meetings/stargazers",
            "contributors_url": "https://api.github.com/repos/shurcooL/meetings/contributors",
            "subscribers_url": "https://api.github.com/repos/shurcooL/meetings/subscribers",
            "subscription_url": "https://api.github.com/repos/shurcooL/meetings/subscription",
            "commits_url": "https://api.github.com/repos/shurcooL/meetings/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/shurcooL/meetings/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/shurcooL/meetings/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/shurcooL/meetings/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/shurcooL/meetings/contents/{+path}",
            "compare_url": "https://api.github.com/repos/shurcooL/meetings/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/shurcooL/meetings/merges",
            "archive_url": "https://api.github.com/repos/shurcooL/meetings/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/shurcooL/meetings/downloads",
            "issues_url": "https://api.github.com/repos/shurcooL/meetings/issues{/number}",
            "pulls_url": "https://api.github.com/repos/shurcooL/meetings/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/shurcooL/meetings/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/shurcooL/meetings/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/shurcooL/meetings/labels{/name}",
            "releases_url": "https://api.github.com/repos/shurcooL/meetings/releases{/id}",
            "deployments_url": "https://api.github.com/repos/shurcooL/meetings/deployments",
            "created_at": "2017-05-06T01:40:59Z",
            "updated_at": "2017-05-04T05:11:05Z",
            "pushed_at": "2017-05-06T01:41:36Z",
            "git_url": "git://github.com/shurcooL/meetings.git",
            "ssh_url": "git@github.com:shurcooL/meetings.git",
            "clone_url": "https://github.com/shurcooL/meetings.git",
            "svn_url": "https://github.com/shurcooL/meetings",
            "homepage": null,
            "size": 33,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": null,
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "WebAssembly:master",
          "ref": "master",
          "sha": "88042a776c04b78d55f4beddda34dd0e76d6e2a8",
          "user": {
            "login": "WebAssembly",
            "id": 11578470,
            "avatar_url": "https://avatars3.githubusercontent.com/u/11578470?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/WebAssembly",
            "html_url": "https://github.com/WebAssembly",
            "followers_url": "https://api.github.com/users/WebAssembly/followers",
            "following_url": "https://api.github.com/users/WebAssembly/following{/other_user}",
            "gists_url": "https://api.github.com/users/WebAssembly/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/WebAssembly/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/WebAssembly/subscriptions",
            "organizations_url": "https://api.github.com/users/WebAssembly/orgs",
            "repos_url": "https://api.github.com/users/WebAssembly/repos",
            "events_url": "https://api.github.com/users/WebAssembly/events{/privacy}",
            "received_events_url": "https://api.github.com/users/WebAssembly/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 90221822,
            "name": "meetings",
            "full_name": "WebAssembly/meetings",
            "owner": {
              "login": "WebAssembly",
              "id": 11578470,
              "avatar_url": "https://avatars3.githubusercontent.com/u/11578470?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/WebAssembly",
              "html_url": "https://github.com/WebAssembly",
              "followers_url": "https://api.github.com/users/WebAssembly/followers",
              "following_url": "https://api.github.com/users/WebAssembly/following{/other_user}",
              "gists_url": "https://api.github.com/users/WebAssembly/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/WebAssembly/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/WebAssembly/subscriptions",
              "organizations_url": "https://api.github.com/users/WebAssembly/orgs",
              "repos_url": "https://api.github.com/users/WebAssembly/repos",
              "events_url": "https://api.github.com/users/WebAssembly/events{/privacy}",
              "received_events_url": "https://api.github.com/users/WebAssembly/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/WebAssembly/meetings",
            "description": "Information on in-person WebAssembly meetings",
            "fork": false,
            "url": "https://api.github.com/repos/WebAssembly/meetings",
            "forks_url": "https://api.github.com/repos/WebAssembly/meetings/forks",
            "keys_url": "https://api.github.com/repos/WebAssembly/meetings/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/WebAssembly/meetings/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/WebAssembly/meetings/teams",
            "hooks_url": "https://api.github.com/repos/WebAssembly/meetings/hooks",
            "issue_events_url": "https://api.github.com/repos/WebAssembly/meetings/issues/events{/number}",
            "events_url": "https://api.github.com/repos/WebAssembly/meetings/events",
            "assignees_url": "https://api.github.com/repos/WebAssembly/meetings/assignees{/user}",
            "branches_url": "https://api.github.com/repos/WebAssembly/meetings/branches{/branch}",
            "tags_url": "https://api.github.com/repos/WebAssembly/meetings/tags",
            "blobs_url": "https://api.github.com/repos/WebAssembly/meetings/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/WebAssembly/meetings/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/WebAssembly/meetings/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/WebAssembly/meetings/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/WebAssembly/meetings/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/WebAssembly/meetings/languages",
            "stargazers_url": "https://api.github.com/repos/WebAssembly/meetings/stargazers",
            "contributors_url": "https://api.github.com/repos/WebAssembly/meetings/contributors",
            "subscribers_url": "https://api.github.com/repos/WebAssembly/meetings/subscribers",
            "subscription_url": "https://api.github.com/repos/WebAssembly/meetings/subscription",
            "commits_url": "https://api.github.com/repos/WebAssembly/meetings/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/WebAssembly/meetings/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/WebAssembly/meetings/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/WebAssembly/meetings/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/WebAssembly/meetings/contents/{+path}",
            "compare_url": "https://api.github.com/repos/WebAssembly/meetings/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/WebAssembly/meetings/merges",
            "archive_url": "https://api.github.com/repos/WebAssembly/meetings/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/WebAssembly/meetings/downloads",
            "issues_url": "https://api.github.com/repos/WebAssembly/meetings/issues{/number}",
            "pulls_url": "https://api.github.com/repos/WebAssembly/meetings/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/WebAssembly/meetings/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/WebAssembly/meetings/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/WebAssembly/meetings/labels{/name}",
            "releases_url": "https://api.github.com/repos/WebAssembly/meetings/releases{/id}",
            "deployments_url": "https://api.github.com/repos/WebAssembly/meetings/deployments",
            "created_at": "2017-05-04T04:32:02Z",
            "updated_at": "2017-05-04T05:11:05Z",
            "pushed_at": "2017-05-04T05:46:30Z",
            "git_url": "git://github.com/WebAssembly/meetings.git",
            "ssh_url": "git@github.com:WebAssembly/meetings.git",
            "clone_url": "https://github.com/WebAssembly/meetings.git",
            "svn_url": "https://github.com/WebAssembly/meetings",
            "homepage": null,
            "size": 33,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": null,
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 1,
            "mirror_url": null,
            "open_issues_count": 1,
            "forks": 1,
            "open_issues": 1,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/WebAssembly/meetings/pulls/1"
          },
          "html": {
            "href": "https://github.com/WebAssembly/meetings/pull/1"
          },
          "issue": {
            "href": "https://api.github.com/repos/WebAssembly/meetings/issues/1"
          },
          "comments": {
            "href": "https://api.github.com/repos/WebAssembly/meetings/issues/1/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/WebAssembly/meetings/pulls/1/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/WebAssembly/meetings/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/WebAssembly/meetings/pulls/1/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/WebAssembly/meetings/statuses/9a38ceb00af8a4a90c25b999f72b5eb189918c2e"
          }
        },
        "merged": false,
        "mergeable": null,
        "rebaseable": null,
        "mergeable_state": "unknown",
        "merged_by": null,
        "comments": 0,
        "review_comments": 0,
        "maintainer_can_modify": true,
        "commits": 1,
        "additions": 1,
        "deletions": 1,
        "changed_files": 1
      }
    },
    "public": true,
    "created_at": "2017-05-06T01:42:02Z",
    "org": {
      "id": 11578470,
      "login": "WebAssembly",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/WebAssembly",
      "avatar_url": "https://avatars.githubusercontent.com/u/11578470?"
    }
  },
  {
    "id": "5821088039",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 90429725,
      "name": "shurcooL/meetings",
      "url": "https://api.github.com/repos/shurcooL/meetings"
    },
    "payload": {
      "push_id": 1722996769,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/patch-1",
      "head": "9a38ceb00af8a4a90c25b999f72b5eb189918c2e",
      "before": "88042a776c04b78d55f4beddda34dd0e76d6e2a8",
      "commits": [
        {
          "sha": "9a38ceb00af8a4a90c25b999f72b5eb189918c2e",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Fix typo in README.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/meetings/commits/9a38ceb00af8a4a90c25b999f72b5eb189918c2e"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-06T01:41:36Z"
  },
  {
    "id": "5821086820",
    "type": "ForkEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 90221822,
      "name": "WebAssembly/meetings",
      "url": "https://api.github.com/repos/WebAssembly/meetings"
    },
    "payload": {
      "forkee": {
        "id": 90429725,
        "name": "meetings",
        "full_name": "shurcooL/meetings",
        "owner": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "private": false,
        "html_url": "https://github.com/shurcooL/meetings",
        "description": "Information on in-person WebAssembly meetings",
        "fork": true,
        "url": "https://api.github.com/repos/shurcooL/meetings",
        "forks_url": "https://api.github.com/repos/shurcooL/meetings/forks",
        "keys_url": "https://api.github.com/repos/shurcooL/meetings/keys{/key_id}",
        "collaborators_url": "https://api.github.com/repos/shurcooL/meetings/collaborators{/collaborator}",
        "teams_url": "https://api.github.com/repos/shurcooL/meetings/teams",
        "hooks_url": "https://api.github.com/repos/shurcooL/meetings/hooks",
        "issue_events_url": "https://api.github.com/repos/shurcooL/meetings/issues/events{/number}",
        "events_url": "https://api.github.com/repos/shurcooL/meetings/events",
        "assignees_url": "https://api.github.com/repos/shurcooL/meetings/assignees{/user}",
        "branches_url": "https://api.github.com/repos/shurcooL/meetings/branches{/branch}",
        "tags_url": "https://api.github.com/repos/shurcooL/meetings/tags",
        "blobs_url": "https://api.github.com/repos/shurcooL/meetings/git/blobs{/sha}",
        "git_tags_url": "https://api.github.com/repos/shurcooL/meetings/git/tags{/sha}",
        "git_refs_url": "https://api.github.com/repos/shurcooL/meetings/git/refs{/sha}",
        "trees_url": "https://api.github.com/repos/shurcooL/meetings/git/trees{/sha}",
        "statuses_url": "https://api.github.com/repos/shurcooL/meetings/statuses/{sha}",
        "languages_url": "https://api.github.com/repos/shurcooL/meetings/languages",
        "stargazers_url": "https://api.github.com/repos/shurcooL/meetings/stargazers",
        "contributors_url": "https://api.github.com/repos/shurcooL/meetings/contributors",
        "subscribers_url": "https://api.github.com/repos/shurcooL/meetings/subscribers",
        "subscription_url": "https://api.github.com/repos/shurcooL/meetings/subscription",
        "commits_url": "https://api.github.com/repos/shurcooL/meetings/commits{/sha}",
        "git_commits_url": "https://api.github.com/repos/shurcooL/meetings/git/commits{/sha}",
        "comments_url": "https://api.github.com/repos/shurcooL/meetings/comments{/number}",
        "issue_comment_url": "https://api.github.com/repos/shurcooL/meetings/issues/comments{/number}",
        "contents_url": "https://api.github.com/repos/shurcooL/meetings/contents/{+path}",
        "compare_url": "https://api.github.com/repos/shurcooL/meetings/compare/{base}...{head}",
        "merges_url": "https://api.github.com/repos/shurcooL/meetings/merges",
        "archive_url": "https://api.github.com/repos/shurcooL/meetings/{archive_format}{/ref}",
        "downloads_url": "https://api.github.com/repos/shurcooL/meetings/downloads",
        "issues_url": "https://api.github.com/repos/shurcooL/meetings/issues{/number}",
        "pulls_url": "https://api.github.com/repos/shurcooL/meetings/pulls{/number}",
        "milestones_url": "https://api.github.com/repos/shurcooL/meetings/milestones{/number}",
        "notifications_url": "https://api.github.com/repos/shurcooL/meetings/notifications{?since,all,participating}",
        "labels_url": "https://api.github.com/repos/shurcooL/meetings/labels{/name}",
        "releases_url": "https://api.github.com/repos/shurcooL/meetings/releases{/id}",
        "deployments_url": "https://api.github.com/repos/shurcooL/meetings/deployments",
        "created_at": "2017-05-06T01:40:59Z",
        "updated_at": "2017-05-04T05:11:05Z",
        "pushed_at": "2017-05-04T05:46:30Z",
        "git_url": "git://github.com/shurcooL/meetings.git",
        "ssh_url": "git@github.com:shurcooL/meetings.git",
        "clone_url": "https://github.com/shurcooL/meetings.git",
        "svn_url": "https://github.com/shurcooL/meetings",
        "homepage": null,
        "size": 33,
        "stargazers_count": 0,
        "watchers_count": 0,
        "language": null,
        "has_issues": false,
        "has_projects": true,
        "has_downloads": true,
        "has_wiki": false,
        "has_pages": false,
        "forks_count": 0,
        "mirror_url": null,
        "open_issues_count": 0,
        "forks": 0,
        "open_issues": 0,
        "watchers": 0,
        "default_branch": "master",
        "public": true
      }
    },
    "public": true,
    "created_at": "2017-05-06T01:41:00Z",
    "org": {
      "id": 11578470,
      "login": "WebAssembly",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/WebAssembly",
      "avatar_url": "https://avatars.githubusercontent.com/u/11578470?"
    }
  },
  {
    "id": "5821061437",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10270722,
      "name": "google/go-github",
      "url": "https://api.github.com/repos/google/go-github"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/google/go-github/pulls/comments/115110025",
        "pull_request_review_id": 36633929,
        "id": 115110025,
        "diff_hunk": "@@ -97,6 +97,9 @@ const (\n \n \t// https://developer.github.com/changes/2017-02-28-user-blocking-apis-and-webhook/\n \tmediaTypeBlockUsersPreview = \"application/vnd.github.giant-sentry-fist-preview+json\"\n+\n+\t// https://developer.github.com/changes/2017-02-09-community-health/\n+\tmediaTypeRepositoryCommunityHealthMetricsPreview = \"application/vnd.github.black-panther-preview\"",
        "path": "github/github.go",
        "position": 6,
        "original_position": 6,
        "commit_id": "7fa252db541adabc57d9899122b91cf87459831b",
        "original_commit_id": "7fa252db541adabc57d9899122b91cf87459831b",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "Should have ` + "`" + `+json` + "`" + ` at the end, like above.",
        "created_at": "2017-05-06T01:25:37Z",
        "updated_at": "2017-05-06T01:26:35Z",
        "html_url": "https://github.com/google/go-github/pull/628#discussion_r115110025",
        "pull_request_url": "https://api.github.com/repos/google/go-github/pulls/628",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments/115110025"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/628#discussion_r115110025"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/google/go-github/pulls/628",
        "id": 119070615,
        "html_url": "https://github.com/google/go-github/pull/628",
        "diff_url": "https://github.com/google/go-github/pull/628.diff",
        "patch_url": "https://github.com/google/go-github/pull/628.patch",
        "issue_url": "https://api.github.com/repos/google/go-github/issues/628",
        "number": 628,
        "state": "open",
        "locked": false,
        "title": "Add Community Health metrics endpoint",
        "user": {
          "login": "sahildua2305",
          "id": 5206277,
          "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/sahildua2305",
          "html_url": "https://github.com/sahildua2305",
          "followers_url": "https://api.github.com/users/sahildua2305/followers",
          "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
          "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
          "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
          "repos_url": "https://api.github.com/users/sahildua2305/repos",
          "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
          "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "This is a new API released by GitHub and is currently available as a\r\npreview only.\r\nLink - https://developer.github.com/v3/repos/community/#retrieve-community-health-metrics\r\n\r\nFixes: #553",
        "created_at": "2017-05-04T21:28:15Z",
        "updated_at": "2017-05-06T01:26:35Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "bfb5da3ec611ab6c590ea94ee59fd6f2b0e2c0ee",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/google/go-github/pulls/628/commits",
        "review_comments_url": "https://api.github.com/repos/google/go-github/pulls/628/comments",
        "review_comment_url": "https://api.github.com/repos/google/go-github/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/google/go-github/issues/628/comments",
        "statuses_url": "https://api.github.com/repos/google/go-github/statuses/7fa252db541adabc57d9899122b91cf87459831b",
        "head": {
          "label": "sahildua2305:add-community-health",
          "ref": "add-community-health",
          "sha": "7fa252db541adabc57d9899122b91cf87459831b",
          "user": {
            "login": "sahildua2305",
            "id": 5206277,
            "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/sahildua2305",
            "html_url": "https://github.com/sahildua2305",
            "followers_url": "https://api.github.com/users/sahildua2305/followers",
            "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
            "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
            "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
            "repos_url": "https://api.github.com/users/sahildua2305/repos",
            "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
            "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 76672222,
            "name": "go-github",
            "full_name": "sahildua2305/go-github",
            "owner": {
              "login": "sahildua2305",
              "id": 5206277,
              "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/sahildua2305",
              "html_url": "https://github.com/sahildua2305",
              "followers_url": "https://api.github.com/users/sahildua2305/followers",
              "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
              "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
              "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
              "repos_url": "https://api.github.com/users/sahildua2305/repos",
              "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
              "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/sahildua2305/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": true,
            "url": "https://api.github.com/repos/sahildua2305/go-github",
            "forks_url": "https://api.github.com/repos/sahildua2305/go-github/forks",
            "keys_url": "https://api.github.com/repos/sahildua2305/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/sahildua2305/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/sahildua2305/go-github/teams",
            "hooks_url": "https://api.github.com/repos/sahildua2305/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/sahildua2305/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/sahildua2305/go-github/events",
            "assignees_url": "https://api.github.com/repos/sahildua2305/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/sahildua2305/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/sahildua2305/go-github/tags",
            "blobs_url": "https://api.github.com/repos/sahildua2305/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/sahildua2305/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/sahildua2305/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/sahildua2305/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/sahildua2305/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/sahildua2305/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/sahildua2305/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/sahildua2305/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/sahildua2305/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/sahildua2305/go-github/subscription",
            "commits_url": "https://api.github.com/repos/sahildua2305/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/sahildua2305/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/sahildua2305/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/sahildua2305/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/sahildua2305/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/sahildua2305/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/sahildua2305/go-github/merges",
            "archive_url": "https://api.github.com/repos/sahildua2305/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/sahildua2305/go-github/downloads",
            "issues_url": "https://api.github.com/repos/sahildua2305/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/sahildua2305/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/sahildua2305/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/sahildua2305/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/sahildua2305/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/sahildua2305/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/sahildua2305/go-github/deployments",
            "created_at": "2016-12-16T17:23:37Z",
            "updated_at": "2016-12-16T17:23:39Z",
            "pushed_at": "2017-05-04T21:41:37Z",
            "git_url": "git://github.com/sahildua2305/go-github.git",
            "ssh_url": "git@github.com:sahildua2305/go-github.git",
            "clone_url": "https://github.com/sahildua2305/go-github.git",
            "svn_url": "https://github.com/sahildua2305/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1444,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "Go",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "google:master",
          "ref": "master",
          "sha": "e8d46665e050742f457a58088b1e6b794b2ae966",
          "user": {
            "login": "google",
            "id": 1342004,
            "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/google",
            "html_url": "https://github.com/google",
            "followers_url": "https://api.github.com/users/google/followers",
            "following_url": "https://api.github.com/users/google/following{/other_user}",
            "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/google/subscriptions",
            "organizations_url": "https://api.github.com/users/google/orgs",
            "repos_url": "https://api.github.com/users/google/repos",
            "events_url": "https://api.github.com/users/google/events{/privacy}",
            "received_events_url": "https://api.github.com/users/google/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 10270722,
            "name": "go-github",
            "full_name": "google/go-github",
            "owner": {
              "login": "google",
              "id": 1342004,
              "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/google",
              "html_url": "https://github.com/google",
              "followers_url": "https://api.github.com/users/google/followers",
              "following_url": "https://api.github.com/users/google/following{/other_user}",
              "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/google/subscriptions",
              "organizations_url": "https://api.github.com/users/google/orgs",
              "repos_url": "https://api.github.com/users/google/repos",
              "events_url": "https://api.github.com/users/google/events{/privacy}",
              "received_events_url": "https://api.github.com/users/google/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/google/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": false,
            "url": "https://api.github.com/repos/google/go-github",
            "forks_url": "https://api.github.com/repos/google/go-github/forks",
            "keys_url": "https://api.github.com/repos/google/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/google/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/google/go-github/teams",
            "hooks_url": "https://api.github.com/repos/google/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/google/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/google/go-github/events",
            "assignees_url": "https://api.github.com/repos/google/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/google/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/google/go-github/tags",
            "blobs_url": "https://api.github.com/repos/google/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/google/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/google/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/google/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/google/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/google/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/google/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/google/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/google/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/google/go-github/subscription",
            "commits_url": "https://api.github.com/repos/google/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/google/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/google/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/google/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/google/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/google/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/google/go-github/merges",
            "archive_url": "https://api.github.com/repos/google/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/google/go-github/downloads",
            "issues_url": "https://api.github.com/repos/google/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/google/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/google/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/google/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/google/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/google/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/google/go-github/deployments",
            "created_at": "2013-05-24T16:42:58Z",
            "updated_at": "2017-05-05T17:39:19Z",
            "pushed_at": "2017-05-05T02:55:09Z",
            "git_url": "git://github.com/google/go-github.git",
            "ssh_url": "git@github.com:google/go-github.git",
            "clone_url": "https://github.com/google/go-github.git",
            "svn_url": "https://github.com/google/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1463,
            "stargazers_count": 2573,
            "watchers_count": 2573,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 582,
            "mirror_url": null,
            "open_issues_count": 46,
            "forks": 582,
            "open_issues": 46,
            "watchers": 2573,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/628"
          },
          "issue": {
            "href": "https://api.github.com/repos/google/go-github/issues/628"
          },
          "comments": {
            "href": "https://api.github.com/repos/google/go-github/issues/628/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/google/go-github/statuses/7fa252db541adabc57d9899122b91cf87459831b"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-06T01:25:37Z",
    "org": {
      "id": 1342004,
      "login": "google",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/google",
      "avatar_url": "https://avatars.githubusercontent.com/u/1342004?"
    }
  },
  {
    "id": "5821061435",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10270722,
      "name": "google/go-github",
      "url": "https://api.github.com/repos/google/go-github"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/google/go-github/pulls/comments/115109960",
        "pull_request_review_id": 36633929,
        "id": 115109960,
        "diff_hunk": "@@ -0,0 +1,58 @@\n+// Copyright 2017 The go-github AUTHORS. All rights reserved.\n+//\n+// Use of this source code is governed by a BSD-style\n+// license that can be found in the LICENSE file.\n+\n+package github\n+\n+import (\n+\t\"context\"\n+\t\"fmt\"\n+\t\"time\"\n+)\n+\n+// CommunityHealthMetrics represents a response containing the community metrics of a repository.\n+type CommunityHealthMetrics struct {\n+\tHealthPercentage *int ` + "`" + `json:\"health_percentage\"` + "`" + `\n+\tFiles            struct {\n+\t\tCodeOfConduct struct {\n+\t\t\tName    *string ` + "`" + `json:\"name\"` + "`" + `\n+\t\t\tKey     *string ` + "`" + `json:\"key\"` + "`" + `\n+\t\t\tURL     *string ` + "`" + `json:\"url\"` + "`" + `\n+\t\t\tHTMLURL *string ` + "`" + `json:\"html_url\"` + "`" + `\n+\t\t} ` + "`" + `json:\"code_of_conduct\"` + "`" + `\n+\t\tContributing struct {\n+\t\t\tURL     *string ` + "`" + `json:\"url\"` + "`" + `\n+\t\t\tHTMLURL *string ` + "`" + `json:\"html_url\"` + "`" + `\n+\t\t} ` + "`" + `json:\"contributing\"` + "`" + `\n+\t\tLicense struct {\n+\t\t\tName    *string ` + "`" + `json:\"name\"` + "`" + `\n+\t\t\tKey     *string ` + "`" + `json:\"key\"` + "`" + `\n+\t\t\tURL     *string ` + "`" + `json:\"url\"` + "`" + `\n+\t\t\tHTMLURL *string ` + "`" + `json:\"html_url\"` + "`" + `\n+\t\t} ` + "`" + `json:\"license\"` + "`" + `\n+\t\tReadme struct {\n+\t\t\tURL     *string ` + "`" + `json:\"url\"` + "`" + `\n+\t\t\tHTMLURL *string ` + "`" + `json:\"html_url\"` + "`" + `\n+\t\t} ` + "`" + `json:\"readme\"` + "`" + `\n+\t} ` + "`" + `json:\"files\"` + "`" + `\n+\tUpdatedAt time.Time ` + "`" + `json:\"updated_at\"` + "`" + `\n+}\n+\n+// GetCommunityHealthMetrics retrieves all the community health  metrics for a  repository.\n+//\n+// GitHub API docs: https://developer.github.com/v3/repos/community/#retrieve-community-health-metrics\n+func (s *RepositoriesService) GetCommunityHealthMetrics(ctx context.Context, owner, repo string) (*CommunityHealthMetrics, *Response, error) {\n+\tu := fmt.Sprintf(\"repositories/%v/%v/community/profile\", owner, repo)",
        "path": "github/repos_community_health.go",
        "position": 46,
        "original_position": 46,
        "commit_id": "7fa252db541adabc57d9899122b91cf87459831b",
        "original_commit_id": "7fa252db541adabc57d9899122b91cf87459831b",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "This should be ` + "`" + `repos/%v/%v/community/profile` + "`" + `.\r\n\r\n` + "`" + `repositories/:repo_id` + "`" + ` is used with numeric repo IDs, rather than ` + "`" + `owner/repo` + "`" + `.\r\n\r\nGitHub API docs are being inconsistent in using ` + "`" + `repositories/:repo_id` + "`" + ` URL style in their docs at https://developer.github.com/v3/repos/community/, and it'd be good to send them an email at support@github.com and let them know. Both are valid, it's just not consistent.",
        "created_at": "2017-05-06T01:23:40Z",
        "updated_at": "2017-05-06T01:26:35Z",
        "html_url": "https://github.com/google/go-github/pull/628#discussion_r115109960",
        "pull_request_url": "https://api.github.com/repos/google/go-github/pulls/628",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments/115109960"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/628#discussion_r115109960"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/google/go-github/pulls/628",
        "id": 119070615,
        "html_url": "https://github.com/google/go-github/pull/628",
        "diff_url": "https://github.com/google/go-github/pull/628.diff",
        "patch_url": "https://github.com/google/go-github/pull/628.patch",
        "issue_url": "https://api.github.com/repos/google/go-github/issues/628",
        "number": 628,
        "state": "open",
        "locked": false,
        "title": "Add Community Health metrics endpoint",
        "user": {
          "login": "sahildua2305",
          "id": 5206277,
          "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/sahildua2305",
          "html_url": "https://github.com/sahildua2305",
          "followers_url": "https://api.github.com/users/sahildua2305/followers",
          "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
          "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
          "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
          "repos_url": "https://api.github.com/users/sahildua2305/repos",
          "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
          "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "This is a new API released by GitHub and is currently available as a\r\npreview only.\r\nLink - https://developer.github.com/v3/repos/community/#retrieve-community-health-metrics\r\n\r\nFixes: #553",
        "created_at": "2017-05-04T21:28:15Z",
        "updated_at": "2017-05-06T01:26:35Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "bfb5da3ec611ab6c590ea94ee59fd6f2b0e2c0ee",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/google/go-github/pulls/628/commits",
        "review_comments_url": "https://api.github.com/repos/google/go-github/pulls/628/comments",
        "review_comment_url": "https://api.github.com/repos/google/go-github/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/google/go-github/issues/628/comments",
        "statuses_url": "https://api.github.com/repos/google/go-github/statuses/7fa252db541adabc57d9899122b91cf87459831b",
        "head": {
          "label": "sahildua2305:add-community-health",
          "ref": "add-community-health",
          "sha": "7fa252db541adabc57d9899122b91cf87459831b",
          "user": {
            "login": "sahildua2305",
            "id": 5206277,
            "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/sahildua2305",
            "html_url": "https://github.com/sahildua2305",
            "followers_url": "https://api.github.com/users/sahildua2305/followers",
            "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
            "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
            "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
            "repos_url": "https://api.github.com/users/sahildua2305/repos",
            "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
            "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 76672222,
            "name": "go-github",
            "full_name": "sahildua2305/go-github",
            "owner": {
              "login": "sahildua2305",
              "id": 5206277,
              "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/sahildua2305",
              "html_url": "https://github.com/sahildua2305",
              "followers_url": "https://api.github.com/users/sahildua2305/followers",
              "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
              "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
              "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
              "repos_url": "https://api.github.com/users/sahildua2305/repos",
              "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
              "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/sahildua2305/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": true,
            "url": "https://api.github.com/repos/sahildua2305/go-github",
            "forks_url": "https://api.github.com/repos/sahildua2305/go-github/forks",
            "keys_url": "https://api.github.com/repos/sahildua2305/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/sahildua2305/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/sahildua2305/go-github/teams",
            "hooks_url": "https://api.github.com/repos/sahildua2305/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/sahildua2305/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/sahildua2305/go-github/events",
            "assignees_url": "https://api.github.com/repos/sahildua2305/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/sahildua2305/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/sahildua2305/go-github/tags",
            "blobs_url": "https://api.github.com/repos/sahildua2305/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/sahildua2305/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/sahildua2305/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/sahildua2305/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/sahildua2305/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/sahildua2305/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/sahildua2305/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/sahildua2305/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/sahildua2305/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/sahildua2305/go-github/subscription",
            "commits_url": "https://api.github.com/repos/sahildua2305/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/sahildua2305/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/sahildua2305/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/sahildua2305/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/sahildua2305/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/sahildua2305/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/sahildua2305/go-github/merges",
            "archive_url": "https://api.github.com/repos/sahildua2305/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/sahildua2305/go-github/downloads",
            "issues_url": "https://api.github.com/repos/sahildua2305/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/sahildua2305/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/sahildua2305/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/sahildua2305/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/sahildua2305/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/sahildua2305/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/sahildua2305/go-github/deployments",
            "created_at": "2016-12-16T17:23:37Z",
            "updated_at": "2016-12-16T17:23:39Z",
            "pushed_at": "2017-05-04T21:41:37Z",
            "git_url": "git://github.com/sahildua2305/go-github.git",
            "ssh_url": "git@github.com:sahildua2305/go-github.git",
            "clone_url": "https://github.com/sahildua2305/go-github.git",
            "svn_url": "https://github.com/sahildua2305/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1444,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "Go",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "google:master",
          "ref": "master",
          "sha": "e8d46665e050742f457a58088b1e6b794b2ae966",
          "user": {
            "login": "google",
            "id": 1342004,
            "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/google",
            "html_url": "https://github.com/google",
            "followers_url": "https://api.github.com/users/google/followers",
            "following_url": "https://api.github.com/users/google/following{/other_user}",
            "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/google/subscriptions",
            "organizations_url": "https://api.github.com/users/google/orgs",
            "repos_url": "https://api.github.com/users/google/repos",
            "events_url": "https://api.github.com/users/google/events{/privacy}",
            "received_events_url": "https://api.github.com/users/google/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 10270722,
            "name": "go-github",
            "full_name": "google/go-github",
            "owner": {
              "login": "google",
              "id": 1342004,
              "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/google",
              "html_url": "https://github.com/google",
              "followers_url": "https://api.github.com/users/google/followers",
              "following_url": "https://api.github.com/users/google/following{/other_user}",
              "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/google/subscriptions",
              "organizations_url": "https://api.github.com/users/google/orgs",
              "repos_url": "https://api.github.com/users/google/repos",
              "events_url": "https://api.github.com/users/google/events{/privacy}",
              "received_events_url": "https://api.github.com/users/google/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/google/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": false,
            "url": "https://api.github.com/repos/google/go-github",
            "forks_url": "https://api.github.com/repos/google/go-github/forks",
            "keys_url": "https://api.github.com/repos/google/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/google/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/google/go-github/teams",
            "hooks_url": "https://api.github.com/repos/google/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/google/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/google/go-github/events",
            "assignees_url": "https://api.github.com/repos/google/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/google/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/google/go-github/tags",
            "blobs_url": "https://api.github.com/repos/google/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/google/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/google/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/google/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/google/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/google/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/google/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/google/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/google/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/google/go-github/subscription",
            "commits_url": "https://api.github.com/repos/google/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/google/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/google/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/google/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/google/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/google/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/google/go-github/merges",
            "archive_url": "https://api.github.com/repos/google/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/google/go-github/downloads",
            "issues_url": "https://api.github.com/repos/google/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/google/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/google/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/google/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/google/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/google/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/google/go-github/deployments",
            "created_at": "2013-05-24T16:42:58Z",
            "updated_at": "2017-05-05T17:39:19Z",
            "pushed_at": "2017-05-05T02:55:09Z",
            "git_url": "git://github.com/google/go-github.git",
            "ssh_url": "git@github.com:google/go-github.git",
            "clone_url": "https://github.com/google/go-github.git",
            "svn_url": "https://github.com/google/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1463,
            "stargazers_count": 2573,
            "watchers_count": 2573,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 582,
            "mirror_url": null,
            "open_issues_count": 46,
            "forks": 582,
            "open_issues": 46,
            "watchers": 2573,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/628"
          },
          "issue": {
            "href": "https://api.github.com/repos/google/go-github/issues/628"
          },
          "comments": {
            "href": "https://api.github.com/repos/google/go-github/issues/628/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/google/go-github/statuses/7fa252db541adabc57d9899122b91cf87459831b"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-06T01:23:40Z",
    "org": {
      "id": 1342004,
      "login": "google",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/google",
      "avatar_url": "https://avatars.githubusercontent.com/u/1342004?"
    }
  },
  {
    "id": "5821037968",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10270722,
      "name": "google/go-github",
      "url": "https://api.github.com/repos/google/go-github"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/google/go-github/pulls/comments/115109716",
        "pull_request_review_id": 36633686,
        "id": 115109716,
        "diff_hunk": "@@ -0,0 +1,58 @@\n+// Copyright 2017 The go-github AUTHORS. All rights reserved.\n+//\n+// Use of this source code is governed by a BSD-style\n+// license that can be found in the LICENSE file.\n+\n+package github\n+\n+import (\n+\t\"context\"\n+\t\"fmt\"\n+\t\"time\"\n+)\n+\n+// CommunityHealthMetrics represents a response containing the community metrics of a repository.\n+type CommunityHealthMetrics struct {\n+\tHealthPercentage *int ` + "`" + `json:\"health_percentage\"` + "`" + `\n+\tFiles            struct {\n+\t\tCodeOfConduct struct {\n+\t\t\tName    *string ` + "`" + `json:\"name\"` + "`" + `\n+\t\t\tKey     *string ` + "`" + `json:\"key\"` + "`" + `\n+\t\t\tURL     *string ` + "`" + `json:\"url\"` + "`" + `\n+\t\t\tHTMLURL *string ` + "`" + `json:\"html_url\"` + "`" + `\n+\t\t} ` + "`" + `json:\"code_of_conduct\"` + "`" + `\n+\t\tContributing struct {\n+\t\t\tURL     *string ` + "`" + `json:\"url\"` + "`" + `\n+\t\t\tHTMLURL *string ` + "`" + `json:\"html_url\"` + "`" + `\n+\t\t} ` + "`" + `json:\"contributing\"` + "`" + `\n+\t\tLicense struct {\n+\t\t\tName    *string ` + "`" + `json:\"name\"` + "`" + `\n+\t\t\tKey     *string ` + "`" + `json:\"key\"` + "`" + `\n+\t\t\tURL     *string ` + "`" + `json:\"url\"` + "`" + `\n+\t\t\tHTMLURL *string ` + "`" + `json:\"html_url\"` + "`" + `\n+\t\t} ` + "`" + `json:\"license\"` + "`" + `\n+\t\tReadme struct {\n+\t\t\tURL     *string ` + "`" + `json:\"url\"` + "`" + `\n+\t\t\tHTMLURL *string ` + "`" + `json:\"html_url\"` + "`" + `\n+\t\t} ` + "`" + `json:\"readme\"` + "`" + `\n+\t} ` + "`" + `json:\"files\"` + "`" + `\n+\tUpdatedAt time.Time ` + "`" + `json:\"updated_at\"` + "`" + `",
        "path": "github/repos_community_health.go",
        "position": 39,
        "original_position": 39,
        "commit_id": "7fa252db541adabc57d9899122b91cf87459831b",
        "original_commit_id": "7fa252db541adabc57d9899122b91cf87459831b",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "Should this be a pointer too, for consistency? Other structs have it as pointer.",
        "created_at": "2017-05-06T01:14:29Z",
        "updated_at": "2017-05-06T01:14:29Z",
        "html_url": "https://github.com/google/go-github/pull/628#discussion_r115109716",
        "pull_request_url": "https://api.github.com/repos/google/go-github/pulls/628",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments/115109716"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/628#discussion_r115109716"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/google/go-github/pulls/628",
        "id": 119070615,
        "html_url": "https://github.com/google/go-github/pull/628",
        "diff_url": "https://github.com/google/go-github/pull/628.diff",
        "patch_url": "https://github.com/google/go-github/pull/628.patch",
        "issue_url": "https://api.github.com/repos/google/go-github/issues/628",
        "number": 628,
        "state": "open",
        "locked": false,
        "title": "Add Community Health metrics endpoint",
        "user": {
          "login": "sahildua2305",
          "id": 5206277,
          "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/sahildua2305",
          "html_url": "https://github.com/sahildua2305",
          "followers_url": "https://api.github.com/users/sahildua2305/followers",
          "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
          "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
          "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
          "repos_url": "https://api.github.com/users/sahildua2305/repos",
          "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
          "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "This is a new API released by GitHub and is currently available as a\r\npreview only.\r\nLink - https://developer.github.com/v3/repos/community/#retrieve-community-health-metrics\r\n\r\nFixes: #553",
        "created_at": "2017-05-04T21:28:15Z",
        "updated_at": "2017-05-06T01:14:29Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "bfb5da3ec611ab6c590ea94ee59fd6f2b0e2c0ee",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/google/go-github/pulls/628/commits",
        "review_comments_url": "https://api.github.com/repos/google/go-github/pulls/628/comments",
        "review_comment_url": "https://api.github.com/repos/google/go-github/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/google/go-github/issues/628/comments",
        "statuses_url": "https://api.github.com/repos/google/go-github/statuses/7fa252db541adabc57d9899122b91cf87459831b",
        "head": {
          "label": "sahildua2305:add-community-health",
          "ref": "add-community-health",
          "sha": "7fa252db541adabc57d9899122b91cf87459831b",
          "user": {
            "login": "sahildua2305",
            "id": 5206277,
            "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/sahildua2305",
            "html_url": "https://github.com/sahildua2305",
            "followers_url": "https://api.github.com/users/sahildua2305/followers",
            "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
            "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
            "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
            "repos_url": "https://api.github.com/users/sahildua2305/repos",
            "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
            "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 76672222,
            "name": "go-github",
            "full_name": "sahildua2305/go-github",
            "owner": {
              "login": "sahildua2305",
              "id": 5206277,
              "avatar_url": "https://avatars1.githubusercontent.com/u/5206277?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/sahildua2305",
              "html_url": "https://github.com/sahildua2305",
              "followers_url": "https://api.github.com/users/sahildua2305/followers",
              "following_url": "https://api.github.com/users/sahildua2305/following{/other_user}",
              "gists_url": "https://api.github.com/users/sahildua2305/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/sahildua2305/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/sahildua2305/subscriptions",
              "organizations_url": "https://api.github.com/users/sahildua2305/orgs",
              "repos_url": "https://api.github.com/users/sahildua2305/repos",
              "events_url": "https://api.github.com/users/sahildua2305/events{/privacy}",
              "received_events_url": "https://api.github.com/users/sahildua2305/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/sahildua2305/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": true,
            "url": "https://api.github.com/repos/sahildua2305/go-github",
            "forks_url": "https://api.github.com/repos/sahildua2305/go-github/forks",
            "keys_url": "https://api.github.com/repos/sahildua2305/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/sahildua2305/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/sahildua2305/go-github/teams",
            "hooks_url": "https://api.github.com/repos/sahildua2305/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/sahildua2305/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/sahildua2305/go-github/events",
            "assignees_url": "https://api.github.com/repos/sahildua2305/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/sahildua2305/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/sahildua2305/go-github/tags",
            "blobs_url": "https://api.github.com/repos/sahildua2305/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/sahildua2305/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/sahildua2305/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/sahildua2305/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/sahildua2305/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/sahildua2305/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/sahildua2305/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/sahildua2305/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/sahildua2305/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/sahildua2305/go-github/subscription",
            "commits_url": "https://api.github.com/repos/sahildua2305/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/sahildua2305/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/sahildua2305/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/sahildua2305/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/sahildua2305/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/sahildua2305/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/sahildua2305/go-github/merges",
            "archive_url": "https://api.github.com/repos/sahildua2305/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/sahildua2305/go-github/downloads",
            "issues_url": "https://api.github.com/repos/sahildua2305/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/sahildua2305/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/sahildua2305/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/sahildua2305/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/sahildua2305/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/sahildua2305/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/sahildua2305/go-github/deployments",
            "created_at": "2016-12-16T17:23:37Z",
            "updated_at": "2016-12-16T17:23:39Z",
            "pushed_at": "2017-05-04T21:41:37Z",
            "git_url": "git://github.com/sahildua2305/go-github.git",
            "ssh_url": "git@github.com:sahildua2305/go-github.git",
            "clone_url": "https://github.com/sahildua2305/go-github.git",
            "svn_url": "https://github.com/sahildua2305/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1444,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "Go",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "google:master",
          "ref": "master",
          "sha": "e8d46665e050742f457a58088b1e6b794b2ae966",
          "user": {
            "login": "google",
            "id": 1342004,
            "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/google",
            "html_url": "https://github.com/google",
            "followers_url": "https://api.github.com/users/google/followers",
            "following_url": "https://api.github.com/users/google/following{/other_user}",
            "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/google/subscriptions",
            "organizations_url": "https://api.github.com/users/google/orgs",
            "repos_url": "https://api.github.com/users/google/repos",
            "events_url": "https://api.github.com/users/google/events{/privacy}",
            "received_events_url": "https://api.github.com/users/google/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 10270722,
            "name": "go-github",
            "full_name": "google/go-github",
            "owner": {
              "login": "google",
              "id": 1342004,
              "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/google",
              "html_url": "https://github.com/google",
              "followers_url": "https://api.github.com/users/google/followers",
              "following_url": "https://api.github.com/users/google/following{/other_user}",
              "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/google/subscriptions",
              "organizations_url": "https://api.github.com/users/google/orgs",
              "repos_url": "https://api.github.com/users/google/repos",
              "events_url": "https://api.github.com/users/google/events{/privacy}",
              "received_events_url": "https://api.github.com/users/google/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/google/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": false,
            "url": "https://api.github.com/repos/google/go-github",
            "forks_url": "https://api.github.com/repos/google/go-github/forks",
            "keys_url": "https://api.github.com/repos/google/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/google/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/google/go-github/teams",
            "hooks_url": "https://api.github.com/repos/google/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/google/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/google/go-github/events",
            "assignees_url": "https://api.github.com/repos/google/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/google/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/google/go-github/tags",
            "blobs_url": "https://api.github.com/repos/google/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/google/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/google/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/google/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/google/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/google/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/google/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/google/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/google/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/google/go-github/subscription",
            "commits_url": "https://api.github.com/repos/google/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/google/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/google/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/google/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/google/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/google/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/google/go-github/merges",
            "archive_url": "https://api.github.com/repos/google/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/google/go-github/downloads",
            "issues_url": "https://api.github.com/repos/google/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/google/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/google/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/google/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/google/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/google/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/google/go-github/deployments",
            "created_at": "2013-05-24T16:42:58Z",
            "updated_at": "2017-05-05T17:39:19Z",
            "pushed_at": "2017-05-05T02:55:09Z",
            "git_url": "git://github.com/google/go-github.git",
            "ssh_url": "git@github.com:google/go-github.git",
            "clone_url": "https://github.com/google/go-github.git",
            "svn_url": "https://github.com/google/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1463,
            "stargazers_count": 2573,
            "watchers_count": 2573,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 582,
            "mirror_url": null,
            "open_issues_count": 46,
            "forks": 582,
            "open_issues": 46,
            "watchers": 2573,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/628"
          },
          "issue": {
            "href": "https://api.github.com/repos/google/go-github/issues/628"
          },
          "comments": {
            "href": "https://api.github.com/repos/google/go-github/issues/628/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/google/go-github/pulls/628/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/google/go-github/statuses/7fa252db541adabc57d9899122b91cf87459831b"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-06T01:14:29Z",
    "org": {
      "id": 1342004,
      "login": "google",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/google",
      "avatar_url": "https://avatars.githubusercontent.com/u/1342004?"
    }
  },
  {
    "id": "5819818577",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10270722,
      "name": "google/go-github",
      "url": "https://api.github.com/repos/google/go-github"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/google/go-github/issues/629",
        "repository_url": "https://api.github.com/repos/google/go-github",
        "labels_url": "https://api.github.com/repos/google/go-github/issues/629/labels{/name}",
        "comments_url": "https://api.github.com/repos/google/go-github/issues/629/comments",
        "events_url": "https://api.github.com/repos/google/go-github/issues/629/events",
        "html_url": "https://github.com/google/go-github/issues/629",
        "id": 226443200,
        "number": 629,
        "title": "The name of ` + "`" + `content` + "`" + ` in the response of Github Trees API has changed",
        "user": {
          "login": "kaakaa",
          "id": 1453749,
          "avatar_url": "https://avatars3.githubusercontent.com/u/1453749?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/kaakaa",
          "html_url": "https://github.com/kaakaa",
          "followers_url": "https://api.github.com/users/kaakaa/followers",
          "following_url": "https://api.github.com/users/kaakaa/following{/other_user}",
          "gists_url": "https://api.github.com/users/kaakaa/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/kaakaa/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/kaakaa/subscriptions",
          "organizations_url": "https://api.github.com/users/kaakaa/orgs",
          "repos_url": "https://api.github.com/users/kaakaa/repos",
          "events_url": "https://api.github.com/users/kaakaa/events{/privacy}",
          "received_events_url": "https://api.github.com/users/kaakaa/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 0,
        "created_at": "2017-05-05T00:19:00Z",
        "updated_at": "2017-05-05T20:18:55Z",
        "closed_at": null,
        "body": "Function [` + "`" + `GetTree` + "`" + `](https://godoc.org/github.com/google/go-github/github#GitService.GetTree) returns the  [Tree](https://godoc.org/github.com/google/go-github/github#Tree) object with empty ` + "`" + `content` + "`" + `.\r\nIt seems to be caused by the fact that ` + "`" + `content` + "`" + ` for [Github Trees API](https://developer.github.com/v3/git/trees/#get-a-tree) has changed to the name of ` + "`" + `url` + "`" + `.\r\n\r\nI'll make PR about changing the name of ` + "`" + `Content` + "`" + ` in [Tree](https://godoc.org/github.com/google/go-github/github#Tree) to ` + "`" + `URL` + "`" + `."
      },
      "comment": {
        "url": "https://api.github.com/repos/google/go-github/issues/comments/299565764",
        "html_url": "https://github.com/google/go-github/issues/629#issuecomment-299565764",
        "issue_url": "https://api.github.com/repos/google/go-github/issues/629",
        "id": 299565764,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-05T20:18:55Z",
        "updated_at": "2017-05-05T20:18:55Z",
        "body": "The [` + "`" + `TreeEntry.Content` + "`" + `](https://godoc.org/github.com/google/go-github/github#TreeEntry.Content) field is not used for [` + "`" + `GetTree` + "`" + `](https://godoc.org/github.com/google/go-github/github#GitService.GetTree), but it is used in [` + "`" + `CreateTree` + "`" + `](https://godoc.org/github.com/google/go-github/github#GitService.CreateTree).\r\n\r\nSee https://developer.github.com/v3/git/trees/#create-a-tree.\r\n\r\n(It's a bit misleading because we reuse the same struct for querying and updating. Perhaps unfortunately so. Changing that would be a breaking API change.)\r\n\r\nHowever, ` + "`" + `url` + "`" + ` is a new field that was added, so you're welcome to create a PR that adds it. Just don't remove ` + "`" + `content` + "`" + `, since it's still valid."
      }
    },
    "public": true,
    "created_at": "2017-05-05T20:18:55Z",
    "org": {
      "id": 1342004,
      "login": "google",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/google",
      "avatar_url": "https://avatars.githubusercontent.com/u/1342004?"
    }
  },
  {
    "id": "5819757350",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10270722,
      "name": "google/go-github",
      "url": "https://api.github.com/repos/google/go-github"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/google/go-github/pulls/comments/115077161",
        "pull_request_review_id": 36596206,
        "id": 115077161,
        "diff_hunk": "@@ -323,6 +323,17 @@ type OrganizationEvent struct {\n \tInstallation *Installation ` + "`" + `json:\"installation,omitempty\"` + "`" + `\n }\n \n+// OrgBlockEvent is triggered when an organization blocks or unblocks a user.\n+// The Webhook event name is \"org_block\".\n+//\n+// GitHub API docs: https://developer.github.com/v3/activity/events/types/#orgblockevent\n+type OrgBlockEvent struct {\n+\tAction       *string       ` + "`" + `json:\"action,omitempty\"` + "`" + `\n+\tBlockedUser  *User         ` + "`" + `json:\"blocked_user,omitempty\"` + "`" + `\n+\tOrganization *Organization ` + "`" + `json:\"organization,omitempty\"` + "`" + `\n+\tSender       *User         ` + "`" + `json:\"sender,omitempty\"` + "`" + `",
        "path": "github/event_types.go",
        "position": 12,
        "original_position": 12,
        "commit_id": "ea6d8cd059e2a8aea64d85b8a7fc6138cd256006",
        "original_commit_id": "ea6d8cd059e2a8aea64d85b8a7fc6138cd256006",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "You should also include ` + "`" + `Installation` + "`" + ` here. It's a part of all events.\r\n\r\n` + "```" + `Go\r\n...\r\nSender       *User         ` + "`" + `json:\"sender,omitempty\"` + "`" + `\r\n\r\n// The following fields are only populated by Webhook events.\r\nInstallation *Installation ` + "`" + `json:\"installation,omitempty\"` + "`" + `\r\n` + "```" + `\r\n\r\nSee https://developer.github.com/webhooks/#payloads:\r\n\r\n> **In addition to the fields documented for each event,** webhook payloads include the user who performed the event (sender) as well as the organization (` + "`" + `organization` + "`" + `) and/or repository (` + "`" + `repository` + "`" + `) which the event occurred on, and for an Integration's webhook **may include the installation (` + "`" + `installation` + "`" + `) which an event relates to**.\r\n\r\nRelated to #505. /cc @bradleyfalzon",
        "created_at": "2017-05-05T20:02:22Z",
        "updated_at": "2017-05-05T20:09:03Z",
        "html_url": "https://github.com/google/go-github/pull/630#discussion_r115077161",
        "pull_request_url": "https://api.github.com/repos/google/go-github/pulls/630",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments/115077161"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/630#discussion_r115077161"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/google/go-github/pulls/630"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/google/go-github/pulls/630",
        "id": 119102602,
        "html_url": "https://github.com/google/go-github/pull/630",
        "diff_url": "https://github.com/google/go-github/pull/630.diff",
        "patch_url": "https://github.com/google/go-github/pull/630.patch",
        "issue_url": "https://api.github.com/repos/google/go-github/issues/630",
        "number": 630,
        "state": "open",
        "locked": false,
        "title": "#569:3 Webhooks for OrgBlockEvent",
        "user": {
          "login": "varadarajana",
          "id": 8947444,
          "avatar_url": "https://avatars3.githubusercontent.com/u/8947444?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/varadarajana",
          "html_url": "https://github.com/varadarajana",
          "followers_url": "https://api.github.com/users/varadarajana/followers",
          "following_url": "https://api.github.com/users/varadarajana/following{/other_user}",
          "gists_url": "https://api.github.com/users/varadarajana/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/varadarajana/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/varadarajana/subscriptions",
          "organizations_url": "https://api.github.com/users/varadarajana/orgs",
          "repos_url": "https://api.github.com/users/varadarajana/repos",
          "events_url": "https://api.github.com/users/varadarajana/events{/privacy}",
          "received_events_url": "https://api.github.com/users/varadarajana/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "@shurcooL I have now been able to isolate only the changes for this file based on your inputs. Thank you for your inputs. I was struggling for long on how to remove this. Please review these changes.\r\n\r\nResolves #569.",
        "created_at": "2017-05-05T02:55:09Z",
        "updated_at": "2017-05-05T20:09:03Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "c9fb4ec92b1e37a638b6ce19a54ded5d8818b768",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/google/go-github/pulls/630/commits",
        "review_comments_url": "https://api.github.com/repos/google/go-github/pulls/630/comments",
        "review_comment_url": "https://api.github.com/repos/google/go-github/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/google/go-github/issues/630/comments",
        "statuses_url": "https://api.github.com/repos/google/go-github/statuses/ea6d8cd059e2a8aea64d85b8a7fc6138cd256006",
        "head": {
          "label": "varadarajana:Issue569_3_cherrypick_1",
          "ref": "Issue569_3_cherrypick_1",
          "sha": "ea6d8cd059e2a8aea64d85b8a7fc6138cd256006",
          "user": {
            "login": "varadarajana",
            "id": 8947444,
            "avatar_url": "https://avatars3.githubusercontent.com/u/8947444?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/varadarajana",
            "html_url": "https://github.com/varadarajana",
            "followers_url": "https://api.github.com/users/varadarajana/followers",
            "following_url": "https://api.github.com/users/varadarajana/following{/other_user}",
            "gists_url": "https://api.github.com/users/varadarajana/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/varadarajana/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/varadarajana/subscriptions",
            "organizations_url": "https://api.github.com/users/varadarajana/orgs",
            "repos_url": "https://api.github.com/users/varadarajana/repos",
            "events_url": "https://api.github.com/users/varadarajana/events{/privacy}",
            "received_events_url": "https://api.github.com/users/varadarajana/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 78328404,
            "name": "go-github",
            "full_name": "varadarajana/go-github",
            "owner": {
              "login": "varadarajana",
              "id": 8947444,
              "avatar_url": "https://avatars3.githubusercontent.com/u/8947444?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/varadarajana",
              "html_url": "https://github.com/varadarajana",
              "followers_url": "https://api.github.com/users/varadarajana/followers",
              "following_url": "https://api.github.com/users/varadarajana/following{/other_user}",
              "gists_url": "https://api.github.com/users/varadarajana/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/varadarajana/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/varadarajana/subscriptions",
              "organizations_url": "https://api.github.com/users/varadarajana/orgs",
              "repos_url": "https://api.github.com/users/varadarajana/repos",
              "events_url": "https://api.github.com/users/varadarajana/events{/privacy}",
              "received_events_url": "https://api.github.com/users/varadarajana/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/varadarajana/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": true,
            "url": "https://api.github.com/repos/varadarajana/go-github",
            "forks_url": "https://api.github.com/repos/varadarajana/go-github/forks",
            "keys_url": "https://api.github.com/repos/varadarajana/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/varadarajana/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/varadarajana/go-github/teams",
            "hooks_url": "https://api.github.com/repos/varadarajana/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/varadarajana/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/varadarajana/go-github/events",
            "assignees_url": "https://api.github.com/repos/varadarajana/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/varadarajana/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/varadarajana/go-github/tags",
            "blobs_url": "https://api.github.com/repos/varadarajana/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/varadarajana/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/varadarajana/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/varadarajana/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/varadarajana/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/varadarajana/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/varadarajana/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/varadarajana/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/varadarajana/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/varadarajana/go-github/subscription",
            "commits_url": "https://api.github.com/repos/varadarajana/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/varadarajana/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/varadarajana/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/varadarajana/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/varadarajana/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/varadarajana/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/varadarajana/go-github/merges",
            "archive_url": "https://api.github.com/repos/varadarajana/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/varadarajana/go-github/downloads",
            "issues_url": "https://api.github.com/repos/varadarajana/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/varadarajana/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/varadarajana/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/varadarajana/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/varadarajana/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/varadarajana/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/varadarajana/go-github/deployments",
            "created_at": "2017-01-08T07:32:13Z",
            "updated_at": "2017-01-08T07:32:15Z",
            "pushed_at": "2017-05-05T02:53:31Z",
            "git_url": "git://github.com/varadarajana/go-github.git",
            "ssh_url": "git@github.com:varadarajana/go-github.git",
            "clone_url": "https://github.com/varadarajana/go-github.git",
            "svn_url": "https://github.com/varadarajana/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1474,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "Go",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "google:master",
          "ref": "master",
          "sha": "e8d46665e050742f457a58088b1e6b794b2ae966",
          "user": {
            "login": "google",
            "id": 1342004,
            "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/google",
            "html_url": "https://github.com/google",
            "followers_url": "https://api.github.com/users/google/followers",
            "following_url": "https://api.github.com/users/google/following{/other_user}",
            "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/google/subscriptions",
            "organizations_url": "https://api.github.com/users/google/orgs",
            "repos_url": "https://api.github.com/users/google/repos",
            "events_url": "https://api.github.com/users/google/events{/privacy}",
            "received_events_url": "https://api.github.com/users/google/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 10270722,
            "name": "go-github",
            "full_name": "google/go-github",
            "owner": {
              "login": "google",
              "id": 1342004,
              "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/google",
              "html_url": "https://github.com/google",
              "followers_url": "https://api.github.com/users/google/followers",
              "following_url": "https://api.github.com/users/google/following{/other_user}",
              "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/google/subscriptions",
              "organizations_url": "https://api.github.com/users/google/orgs",
              "repos_url": "https://api.github.com/users/google/repos",
              "events_url": "https://api.github.com/users/google/events{/privacy}",
              "received_events_url": "https://api.github.com/users/google/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/google/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": false,
            "url": "https://api.github.com/repos/google/go-github",
            "forks_url": "https://api.github.com/repos/google/go-github/forks",
            "keys_url": "https://api.github.com/repos/google/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/google/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/google/go-github/teams",
            "hooks_url": "https://api.github.com/repos/google/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/google/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/google/go-github/events",
            "assignees_url": "https://api.github.com/repos/google/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/google/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/google/go-github/tags",
            "blobs_url": "https://api.github.com/repos/google/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/google/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/google/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/google/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/google/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/google/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/google/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/google/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/google/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/google/go-github/subscription",
            "commits_url": "https://api.github.com/repos/google/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/google/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/google/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/google/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/google/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/google/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/google/go-github/merges",
            "archive_url": "https://api.github.com/repos/google/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/google/go-github/downloads",
            "issues_url": "https://api.github.com/repos/google/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/google/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/google/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/google/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/google/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/google/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/google/go-github/deployments",
            "created_at": "2013-05-24T16:42:58Z",
            "updated_at": "2017-05-05T17:39:19Z",
            "pushed_at": "2017-05-05T02:55:09Z",
            "git_url": "git://github.com/google/go-github.git",
            "ssh_url": "git@github.com:google/go-github.git",
            "clone_url": "https://github.com/google/go-github.git",
            "svn_url": "https://github.com/google/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1463,
            "stargazers_count": 2573,
            "watchers_count": 2573,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 582,
            "mirror_url": null,
            "open_issues_count": 46,
            "forks": 582,
            "open_issues": 46,
            "watchers": 2573,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/630"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/630"
          },
          "issue": {
            "href": "https://api.github.com/repos/google/go-github/issues/630"
          },
          "comments": {
            "href": "https://api.github.com/repos/google/go-github/issues/630/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/google/go-github/pulls/630/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/google/go-github/pulls/630/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/google/go-github/statuses/ea6d8cd059e2a8aea64d85b8a7fc6138cd256006"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-05T20:02:22Z",
    "org": {
      "id": 1342004,
      "login": "google",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/google",
      "avatar_url": "https://avatars.githubusercontent.com/u/1342004?"
    }
  },
  {
    "id": "5819757344",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10270722,
      "name": "google/go-github",
      "url": "https://api.github.com/repos/google/go-github"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/google/go-github/pulls/comments/115076211",
        "pull_request_review_id": 36596206,
        "id": 115076211,
        "diff_hunk": "@@ -323,6 +323,17 @@ type OrganizationEvent struct {\n \tInstallation *Installation ` + "`" + `json:\"installation,omitempty\"` + "`" + `\n }\n \n+// OrgBlockEvent is triggered when an organization blocks or unblocks a user.\n+// The Webhook event name is \"org_block\".\n+//\n+// GitHub API docs: https://developer.github.com/v3/activity/events/types/#orgblockevent\n+type OrgBlockEvent struct {\n+\tAction       *string       ` + "`" + `json:\"action,omitempty\"` + "`" + `",
        "path": "github/event_types.go",
        "position": 9,
        "original_position": 9,
        "commit_id": "ea6d8cd059e2a8aea64d85b8a7fc6138cd256006",
        "original_commit_id": "ea6d8cd059e2a8aea64d85b8a7fc6138cd256006",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "It'll be helpful to document what values ` + "`" + `Action` + "`" + ` can have:\r\n\r\n` + "```" + `Go\r\n// Action is the action that was performed.\r\n// Can be \"blocked\" or \"unblocked\".\r\nAction       *string       ` + "`" + `json:\"action,omitempty\"` + "`" + `\r\n` + "```" + `",
        "created_at": "2017-05-05T19:56:59Z",
        "updated_at": "2017-05-05T20:09:03Z",
        "html_url": "https://github.com/google/go-github/pull/630#discussion_r115076211",
        "pull_request_url": "https://api.github.com/repos/google/go-github/pulls/630",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments/115076211"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/630#discussion_r115076211"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/google/go-github/pulls/630"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/google/go-github/pulls/630",
        "id": 119102602,
        "html_url": "https://github.com/google/go-github/pull/630",
        "diff_url": "https://github.com/google/go-github/pull/630.diff",
        "patch_url": "https://github.com/google/go-github/pull/630.patch",
        "issue_url": "https://api.github.com/repos/google/go-github/issues/630",
        "number": 630,
        "state": "open",
        "locked": false,
        "title": "#569:3 Webhooks for OrgBlockEvent",
        "user": {
          "login": "varadarajana",
          "id": 8947444,
          "avatar_url": "https://avatars3.githubusercontent.com/u/8947444?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/varadarajana",
          "html_url": "https://github.com/varadarajana",
          "followers_url": "https://api.github.com/users/varadarajana/followers",
          "following_url": "https://api.github.com/users/varadarajana/following{/other_user}",
          "gists_url": "https://api.github.com/users/varadarajana/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/varadarajana/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/varadarajana/subscriptions",
          "organizations_url": "https://api.github.com/users/varadarajana/orgs",
          "repos_url": "https://api.github.com/users/varadarajana/repos",
          "events_url": "https://api.github.com/users/varadarajana/events{/privacy}",
          "received_events_url": "https://api.github.com/users/varadarajana/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "@shurcooL I have now been able to isolate only the changes for this file based on your inputs. Thank you for your inputs. I was struggling for long on how to remove this. Please review these changes.\r\n\r\nResolves #569.",
        "created_at": "2017-05-05T02:55:09Z",
        "updated_at": "2017-05-05T20:09:03Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "c9fb4ec92b1e37a638b6ce19a54ded5d8818b768",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/google/go-github/pulls/630/commits",
        "review_comments_url": "https://api.github.com/repos/google/go-github/pulls/630/comments",
        "review_comment_url": "https://api.github.com/repos/google/go-github/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/google/go-github/issues/630/comments",
        "statuses_url": "https://api.github.com/repos/google/go-github/statuses/ea6d8cd059e2a8aea64d85b8a7fc6138cd256006",
        "head": {
          "label": "varadarajana:Issue569_3_cherrypick_1",
          "ref": "Issue569_3_cherrypick_1",
          "sha": "ea6d8cd059e2a8aea64d85b8a7fc6138cd256006",
          "user": {
            "login": "varadarajana",
            "id": 8947444,
            "avatar_url": "https://avatars3.githubusercontent.com/u/8947444?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/varadarajana",
            "html_url": "https://github.com/varadarajana",
            "followers_url": "https://api.github.com/users/varadarajana/followers",
            "following_url": "https://api.github.com/users/varadarajana/following{/other_user}",
            "gists_url": "https://api.github.com/users/varadarajana/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/varadarajana/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/varadarajana/subscriptions",
            "organizations_url": "https://api.github.com/users/varadarajana/orgs",
            "repos_url": "https://api.github.com/users/varadarajana/repos",
            "events_url": "https://api.github.com/users/varadarajana/events{/privacy}",
            "received_events_url": "https://api.github.com/users/varadarajana/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 78328404,
            "name": "go-github",
            "full_name": "varadarajana/go-github",
            "owner": {
              "login": "varadarajana",
              "id": 8947444,
              "avatar_url": "https://avatars3.githubusercontent.com/u/8947444?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/varadarajana",
              "html_url": "https://github.com/varadarajana",
              "followers_url": "https://api.github.com/users/varadarajana/followers",
              "following_url": "https://api.github.com/users/varadarajana/following{/other_user}",
              "gists_url": "https://api.github.com/users/varadarajana/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/varadarajana/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/varadarajana/subscriptions",
              "organizations_url": "https://api.github.com/users/varadarajana/orgs",
              "repos_url": "https://api.github.com/users/varadarajana/repos",
              "events_url": "https://api.github.com/users/varadarajana/events{/privacy}",
              "received_events_url": "https://api.github.com/users/varadarajana/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/varadarajana/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": true,
            "url": "https://api.github.com/repos/varadarajana/go-github",
            "forks_url": "https://api.github.com/repos/varadarajana/go-github/forks",
            "keys_url": "https://api.github.com/repos/varadarajana/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/varadarajana/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/varadarajana/go-github/teams",
            "hooks_url": "https://api.github.com/repos/varadarajana/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/varadarajana/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/varadarajana/go-github/events",
            "assignees_url": "https://api.github.com/repos/varadarajana/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/varadarajana/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/varadarajana/go-github/tags",
            "blobs_url": "https://api.github.com/repos/varadarajana/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/varadarajana/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/varadarajana/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/varadarajana/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/varadarajana/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/varadarajana/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/varadarajana/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/varadarajana/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/varadarajana/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/varadarajana/go-github/subscription",
            "commits_url": "https://api.github.com/repos/varadarajana/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/varadarajana/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/varadarajana/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/varadarajana/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/varadarajana/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/varadarajana/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/varadarajana/go-github/merges",
            "archive_url": "https://api.github.com/repos/varadarajana/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/varadarajana/go-github/downloads",
            "issues_url": "https://api.github.com/repos/varadarajana/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/varadarajana/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/varadarajana/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/varadarajana/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/varadarajana/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/varadarajana/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/varadarajana/go-github/deployments",
            "created_at": "2017-01-08T07:32:13Z",
            "updated_at": "2017-01-08T07:32:15Z",
            "pushed_at": "2017-05-05T02:53:31Z",
            "git_url": "git://github.com/varadarajana/go-github.git",
            "ssh_url": "git@github.com:varadarajana/go-github.git",
            "clone_url": "https://github.com/varadarajana/go-github.git",
            "svn_url": "https://github.com/varadarajana/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1474,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "Go",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "google:master",
          "ref": "master",
          "sha": "e8d46665e050742f457a58088b1e6b794b2ae966",
          "user": {
            "login": "google",
            "id": 1342004,
            "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/google",
            "html_url": "https://github.com/google",
            "followers_url": "https://api.github.com/users/google/followers",
            "following_url": "https://api.github.com/users/google/following{/other_user}",
            "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/google/subscriptions",
            "organizations_url": "https://api.github.com/users/google/orgs",
            "repos_url": "https://api.github.com/users/google/repos",
            "events_url": "https://api.github.com/users/google/events{/privacy}",
            "received_events_url": "https://api.github.com/users/google/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 10270722,
            "name": "go-github",
            "full_name": "google/go-github",
            "owner": {
              "login": "google",
              "id": 1342004,
              "avatar_url": "https://avatars2.githubusercontent.com/u/1342004?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/google",
              "html_url": "https://github.com/google",
              "followers_url": "https://api.github.com/users/google/followers",
              "following_url": "https://api.github.com/users/google/following{/other_user}",
              "gists_url": "https://api.github.com/users/google/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/google/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/google/subscriptions",
              "organizations_url": "https://api.github.com/users/google/orgs",
              "repos_url": "https://api.github.com/users/google/repos",
              "events_url": "https://api.github.com/users/google/events{/privacy}",
              "received_events_url": "https://api.github.com/users/google/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/google/go-github",
            "description": "Go library for accessing the GitHub API",
            "fork": false,
            "url": "https://api.github.com/repos/google/go-github",
            "forks_url": "https://api.github.com/repos/google/go-github/forks",
            "keys_url": "https://api.github.com/repos/google/go-github/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/google/go-github/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/google/go-github/teams",
            "hooks_url": "https://api.github.com/repos/google/go-github/hooks",
            "issue_events_url": "https://api.github.com/repos/google/go-github/issues/events{/number}",
            "events_url": "https://api.github.com/repos/google/go-github/events",
            "assignees_url": "https://api.github.com/repos/google/go-github/assignees{/user}",
            "branches_url": "https://api.github.com/repos/google/go-github/branches{/branch}",
            "tags_url": "https://api.github.com/repos/google/go-github/tags",
            "blobs_url": "https://api.github.com/repos/google/go-github/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/google/go-github/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/google/go-github/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/google/go-github/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/google/go-github/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/google/go-github/languages",
            "stargazers_url": "https://api.github.com/repos/google/go-github/stargazers",
            "contributors_url": "https://api.github.com/repos/google/go-github/contributors",
            "subscribers_url": "https://api.github.com/repos/google/go-github/subscribers",
            "subscription_url": "https://api.github.com/repos/google/go-github/subscription",
            "commits_url": "https://api.github.com/repos/google/go-github/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/google/go-github/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/google/go-github/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/google/go-github/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/google/go-github/contents/{+path}",
            "compare_url": "https://api.github.com/repos/google/go-github/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/google/go-github/merges",
            "archive_url": "https://api.github.com/repos/google/go-github/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/google/go-github/downloads",
            "issues_url": "https://api.github.com/repos/google/go-github/issues{/number}",
            "pulls_url": "https://api.github.com/repos/google/go-github/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/google/go-github/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/google/go-github/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/google/go-github/labels{/name}",
            "releases_url": "https://api.github.com/repos/google/go-github/releases{/id}",
            "deployments_url": "https://api.github.com/repos/google/go-github/deployments",
            "created_at": "2013-05-24T16:42:58Z",
            "updated_at": "2017-05-05T17:39:19Z",
            "pushed_at": "2017-05-05T02:55:09Z",
            "git_url": "git://github.com/google/go-github.git",
            "ssh_url": "git@github.com:google/go-github.git",
            "clone_url": "https://github.com/google/go-github.git",
            "svn_url": "https://github.com/google/go-github",
            "homepage": "http://godoc.org/github.com/google/go-github/github",
            "size": 1463,
            "stargazers_count": 2573,
            "watchers_count": 2573,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 582,
            "mirror_url": null,
            "open_issues_count": 46,
            "forks": 582,
            "open_issues": 46,
            "watchers": 2573,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/google/go-github/pulls/630"
          },
          "html": {
            "href": "https://github.com/google/go-github/pull/630"
          },
          "issue": {
            "href": "https://api.github.com/repos/google/go-github/issues/630"
          },
          "comments": {
            "href": "https://api.github.com/repos/google/go-github/issues/630/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/google/go-github/pulls/630/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/google/go-github/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/google/go-github/pulls/630/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/google/go-github/statuses/ea6d8cd059e2a8aea64d85b8a7fc6138cd256006"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-05T19:56:59Z",
    "org": {
      "id": 1342004,
      "login": "google",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/google",
      "avatar_url": "https://avatars.githubusercontent.com/u/1342004?"
    }
  },
  {
    "id": "5818160273",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 23096959,
      "name": "golang/go",
      "url": "https://api.github.com/repos/golang/go"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/golang/go/issues/20212",
        "repository_url": "https://api.github.com/repos/golang/go",
        "labels_url": "https://api.github.com/repos/golang/go/issues/20212/labels{/name}",
        "comments_url": "https://api.github.com/repos/golang/go/issues/20212/comments",
        "events_url": "https://api.github.com/repos/golang/go/issues/20212/events",
        "html_url": "https://github.com/golang/go/issues/20212",
        "id": 225746426,
        "number": 20212,
        "title": "usability: Need to add documentation for a binary in three different places",
        "user": {
          "login": "kevinburke",
          "id": 234019,
          "avatar_url": "https://avatars2.githubusercontent.com/u/234019?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/kevinburke",
          "html_url": "https://github.com/kevinburke",
          "followers_url": "https://api.github.com/users/kevinburke/followers",
          "following_url": "https://api.github.com/users/kevinburke/following{/other_user}",
          "gists_url": "https://api.github.com/users/kevinburke/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/kevinburke/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/kevinburke/subscriptions",
          "organizations_url": "https://api.github.com/users/kevinburke/orgs",
          "repos_url": "https://api.github.com/users/kevinburke/repos",
          "events_url": "https://api.github.com/users/kevinburke/events{/privacy}",
          "received_events_url": "https://api.github.com/users/kevinburke/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 150880209,
            "url": "https://api.github.com/repos/golang/go/labels/Documentation",
            "name": "Documentation",
            "color": "aaffaa",
            "default": false
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 6,
        "created_at": "2017-05-02T16:16:41Z",
        "updated_at": "2017-05-05T15:58:37Z",
        "closed_at": null,
        "body": "If I'm shipping a Go binary, generally, I need to add documentation in three different places:\r\n\r\n- a README or README.md file, for people visiting the project via Github. This contains usage information and usually also installation information\r\n\r\n- in ` + "`" + `doc.go` + "`" + ` or similar, so it appears via godoc. [Some go tools document this well][godoc], but many tools fall down on the docs here:\r\n\r\n    - https://godoc.org/github.com/golang/dep/cmd/dep\r\n    - https://godoc.org/golang.org/x/build/maintner/maintnerd\r\n    - https://godoc.org/golang.org/x/build/cmd/gopherbot\r\n    - https://godoc.org/github.com/kubernetes/kubernetes/cmd/kubectl\r\n    - https://godoc.org/github.com/moby/moby/cmd/docker\r\n    - https://godoc.org/github.com/spf13/hugo\r\n\r\n- in ` + "`" + `flag.Usage` + "`" + `, so it looks nice when printed at the command line, and shows you the various arguments you can run.\r\n\r\n[godoc]: https://godoc.org/golang.org/x/tools/cmd/godoc\r\n\r\nIt's a shame that maintainers have to more or less write the same docs in triplicate, and a bad experience for our users when they forget to do so in one or more of the places above. \r\n\r\nI also wonder if this discourages contribution, when people get to a Github source code page and the results are clearly not formatted for browsing on that site.\r\n\r\nI'm wondering what we can do to ease the burden on maintainers, or make it easy to copy docs from one place to another. I understand that the audiences for each documentation place overlap in parts and don't overlap in other parts, but I imagine some docs are better than nothing. Here are some bad ideas:\r\n\r\n- If a ` + "`" + `main` + "`" + ` function has no package docs, but modifies ` + "`" + `flag.CommandLine` + "`" + `, godoc could call ` + "`" + `flag.PrintDefaults` + "`" + `, or call the binary with ` + "`" + `-h` + "`" + ` and then print the result. Note the godoc docs linked above manually copy the output from flag.PrintDefaults and it occasionally gets out of sync.\r\n\r\n- If a ` + "`" + `main` + "`" + ` function has no package docs but has a README.md, ` + "`" + `godoc` + "`" + ` could format README.md and ignore the parts of the markdown spec that we don't want to implement.\r\n\r\n- We could try to get Github to understand and display Go code, the same way [it can currently display a number of formats][formats] like Restructured Text, ASCIIDOC, Creole, RDoc, textile and others.\r\n\r\n[formats]: https://github.com/github/markup"
      },
      "comment": {
        "url": "https://api.github.com/repos/golang/go/issues/comments/299504187",
        "html_url": "https://github.com/golang/go/issues/20212#issuecomment-299504187",
        "issue_url": "https://api.github.com/repos/golang/go/issues/20212",
        "id": 299504187,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-05T15:58:37Z",
        "updated_at": "2017-05-05T15:58:37Z",
        "body": "> But for me go should be able to generate the godoc from the flags of a binary in the first place. (at least for the official \"flag\" package). \r\n\r\nRunning with ` + "`" + `-help` + "`" + ` does list all flags that have been registered, along with their descriptions and default values, etc. This is automatic.\r\n\r\nThe only thing one needs to do in ` + "`" + `flag.Usage` + "`" + ` which is custom is to describe the command.\r\n\r\nPerhaps someone can make a tool, which can be invoked via ` + "`" + `go generate` + "`" + `, that parses ` + "`" + `godoc` + "`" + ` of a command and generates a corresponding ` + "`" + `flag.Usage` + "`" + ` implementation."
      }
    },
    "public": true,
    "created_at": "2017-05-05T15:58:39Z",
    "org": {
      "id": 4314092,
      "login": "golang",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/golang",
      "avatar_url": "https://avatars.githubusercontent.com/u/4314092?"
    }
  },
  {
    "id": "5814115779",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1712708,
      "name": "jlaffaye/ftp",
      "url": "https://api.github.com/repos/jlaffaye/ftp"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/jlaffaye/ftp/pulls/comments/114921442",
        "pull_request_review_id": 36424041,
        "id": 114921442,
        "diff_hunk": "@@ -537,11 +538,15 @@ func (r *Response) Read(buf []byte) (int, error) {\n \n // Close implements the io.Closer interface on a FTP data connection.",
        "path": "ftp.go",
        "position": 41,
        "original_position": 41,
        "commit_id": "cb362c410118164e9c6f2db0e16d095525f9ef94",
        "original_commit_id": "cb362c410118164e9c6f2db0e16d095525f9ef94",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "[` + "`" + `io.Closer` + "`" + `](https://godoc.org/io#Closer) doesn't define what happens on multiple invocations, saying that it's up to each implementation to decide and document that:\r\n\r\n> The behavior of Close after the first call is undefined. Specific implementations may document their own behavior.\r\n\r\nSo perhaps it's a good idea to document the new behavior here. Something like:\r\n\r\n` + "```" + `\r\n// After the first call, Close will do nothing and return nil.\r\n` + "```" + `\r\n\r\nThat way, users will know what to expect. Otherwise, they won't know what happens if calling ` + "`" + `Close` + "`" + ` multiple times without reading source code.",
        "created_at": "2017-05-05T01:44:14Z",
        "updated_at": "2017-05-05T01:44:18Z",
        "html_url": "https://github.com/jlaffaye/ftp/pull/87#discussion_r114921442",
        "pull_request_url": "https://api.github.com/repos/jlaffaye/ftp/pulls/87",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/pulls/comments/114921442"
          },
          "html": {
            "href": "https://github.com/jlaffaye/ftp/pull/87#discussion_r114921442"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/pulls/87"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/jlaffaye/ftp/pulls/87",
        "id": 118470113,
        "html_url": "https://github.com/jlaffaye/ftp/pull/87",
        "diff_url": "https://github.com/jlaffaye/ftp/pull/87.diff",
        "patch_url": "https://github.com/jlaffaye/ftp/pull/87.patch",
        "issue_url": "https://api.github.com/repos/jlaffaye/ftp/issues/87",
        "number": 87,
        "state": "open",
        "locked": false,
        "title": "Avoid forever lock",
        "user": {
          "login": "DAddYE",
          "id": 6537,
          "avatar_url": "https://avatars0.githubusercontent.com/u/6537?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/DAddYE",
          "html_url": "https://github.com/DAddYE",
          "followers_url": "https://api.github.com/users/DAddYE/followers",
          "following_url": "https://api.github.com/users/DAddYE/following{/other_user}",
          "gists_url": "https://api.github.com/users/DAddYE/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/DAddYE/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/DAddYE/subscriptions",
          "organizations_url": "https://api.github.com/users/DAddYE/orgs",
          "repos_url": "https://api.github.com/users/DAddYE/repos",
          "events_url": "https://api.github.com/users/DAddYE/events{/privacy}",
          "received_events_url": "https://api.github.com/users/DAddYE/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "If we close the connection two times the second time will hang forever waiting for a server code.",
        "created_at": "2017-05-02T01:19:01Z",
        "updated_at": "2017-05-05T01:44:18Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "96ed56c9988145e35c972a6939afb1af54cceb66",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/jlaffaye/ftp/pulls/87/commits",
        "review_comments_url": "https://api.github.com/repos/jlaffaye/ftp/pulls/87/comments",
        "review_comment_url": "https://api.github.com/repos/jlaffaye/ftp/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/jlaffaye/ftp/issues/87/comments",
        "statuses_url": "https://api.github.com/repos/jlaffaye/ftp/statuses/cb362c410118164e9c6f2db0e16d095525f9ef94",
        "head": {
          "label": "DAddYE:patch-1",
          "ref": "patch-1",
          "sha": "cb362c410118164e9c6f2db0e16d095525f9ef94",
          "user": {
            "login": "DAddYE",
            "id": 6537,
            "avatar_url": "https://avatars0.githubusercontent.com/u/6537?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/DAddYE",
            "html_url": "https://github.com/DAddYE",
            "followers_url": "https://api.github.com/users/DAddYE/followers",
            "following_url": "https://api.github.com/users/DAddYE/following{/other_user}",
            "gists_url": "https://api.github.com/users/DAddYE/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/DAddYE/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/DAddYE/subscriptions",
            "organizations_url": "https://api.github.com/users/DAddYE/orgs",
            "repos_url": "https://api.github.com/users/DAddYE/repos",
            "events_url": "https://api.github.com/users/DAddYE/events{/privacy}",
            "received_events_url": "https://api.github.com/users/DAddYE/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 89977685,
            "name": "ftp",
            "full_name": "DAddYE/ftp",
            "owner": {
              "login": "DAddYE",
              "id": 6537,
              "avatar_url": "https://avatars0.githubusercontent.com/u/6537?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/DAddYE",
              "html_url": "https://github.com/DAddYE",
              "followers_url": "https://api.github.com/users/DAddYE/followers",
              "following_url": "https://api.github.com/users/DAddYE/following{/other_user}",
              "gists_url": "https://api.github.com/users/DAddYE/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/DAddYE/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/DAddYE/subscriptions",
              "organizations_url": "https://api.github.com/users/DAddYE/orgs",
              "repos_url": "https://api.github.com/users/DAddYE/repos",
              "events_url": "https://api.github.com/users/DAddYE/events{/privacy}",
              "received_events_url": "https://api.github.com/users/DAddYE/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/DAddYE/ftp",
            "description": "FTP client package for Go",
            "fork": true,
            "url": "https://api.github.com/repos/DAddYE/ftp",
            "forks_url": "https://api.github.com/repos/DAddYE/ftp/forks",
            "keys_url": "https://api.github.com/repos/DAddYE/ftp/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/DAddYE/ftp/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/DAddYE/ftp/teams",
            "hooks_url": "https://api.github.com/repos/DAddYE/ftp/hooks",
            "issue_events_url": "https://api.github.com/repos/DAddYE/ftp/issues/events{/number}",
            "events_url": "https://api.github.com/repos/DAddYE/ftp/events",
            "assignees_url": "https://api.github.com/repos/DAddYE/ftp/assignees{/user}",
            "branches_url": "https://api.github.com/repos/DAddYE/ftp/branches{/branch}",
            "tags_url": "https://api.github.com/repos/DAddYE/ftp/tags",
            "blobs_url": "https://api.github.com/repos/DAddYE/ftp/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/DAddYE/ftp/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/DAddYE/ftp/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/DAddYE/ftp/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/DAddYE/ftp/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/DAddYE/ftp/languages",
            "stargazers_url": "https://api.github.com/repos/DAddYE/ftp/stargazers",
            "contributors_url": "https://api.github.com/repos/DAddYE/ftp/contributors",
            "subscribers_url": "https://api.github.com/repos/DAddYE/ftp/subscribers",
            "subscription_url": "https://api.github.com/repos/DAddYE/ftp/subscription",
            "commits_url": "https://api.github.com/repos/DAddYE/ftp/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/DAddYE/ftp/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/DAddYE/ftp/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/DAddYE/ftp/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/DAddYE/ftp/contents/{+path}",
            "compare_url": "https://api.github.com/repos/DAddYE/ftp/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/DAddYE/ftp/merges",
            "archive_url": "https://api.github.com/repos/DAddYE/ftp/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/DAddYE/ftp/downloads",
            "issues_url": "https://api.github.com/repos/DAddYE/ftp/issues{/number}",
            "pulls_url": "https://api.github.com/repos/DAddYE/ftp/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/DAddYE/ftp/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/DAddYE/ftp/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/DAddYE/ftp/labels{/name}",
            "releases_url": "https://api.github.com/repos/DAddYE/ftp/releases{/id}",
            "deployments_url": "https://api.github.com/repos/DAddYE/ftp/deployments",
            "created_at": "2017-05-02T01:17:48Z",
            "updated_at": "2017-05-02T01:17:50Z",
            "pushed_at": "2017-05-05T00:47:00Z",
            "git_url": "git://github.com/DAddYE/ftp.git",
            "ssh_url": "git@github.com:DAddYE/ftp.git",
            "clone_url": "https://github.com/DAddYE/ftp.git",
            "svn_url": "https://github.com/DAddYE/ftp",
            "homepage": "",
            "size": 116,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "Go",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "jlaffaye:master",
          "ref": "master",
          "sha": "0895dc7f07e342edfc22cb884a51e34275cc1e4b",
          "user": {
            "login": "jlaffaye",
            "id": 92914,
            "avatar_url": "https://avatars1.githubusercontent.com/u/92914?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/jlaffaye",
            "html_url": "https://github.com/jlaffaye",
            "followers_url": "https://api.github.com/users/jlaffaye/followers",
            "following_url": "https://api.github.com/users/jlaffaye/following{/other_user}",
            "gists_url": "https://api.github.com/users/jlaffaye/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/jlaffaye/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/jlaffaye/subscriptions",
            "organizations_url": "https://api.github.com/users/jlaffaye/orgs",
            "repos_url": "https://api.github.com/users/jlaffaye/repos",
            "events_url": "https://api.github.com/users/jlaffaye/events{/privacy}",
            "received_events_url": "https://api.github.com/users/jlaffaye/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 1712708,
            "name": "ftp",
            "full_name": "jlaffaye/ftp",
            "owner": {
              "login": "jlaffaye",
              "id": 92914,
              "avatar_url": "https://avatars1.githubusercontent.com/u/92914?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/jlaffaye",
              "html_url": "https://github.com/jlaffaye",
              "followers_url": "https://api.github.com/users/jlaffaye/followers",
              "following_url": "https://api.github.com/users/jlaffaye/following{/other_user}",
              "gists_url": "https://api.github.com/users/jlaffaye/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/jlaffaye/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/jlaffaye/subscriptions",
              "organizations_url": "https://api.github.com/users/jlaffaye/orgs",
              "repos_url": "https://api.github.com/users/jlaffaye/repos",
              "events_url": "https://api.github.com/users/jlaffaye/events{/privacy}",
              "received_events_url": "https://api.github.com/users/jlaffaye/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/jlaffaye/ftp",
            "description": "FTP client package for Go",
            "fork": false,
            "url": "https://api.github.com/repos/jlaffaye/ftp",
            "forks_url": "https://api.github.com/repos/jlaffaye/ftp/forks",
            "keys_url": "https://api.github.com/repos/jlaffaye/ftp/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/jlaffaye/ftp/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/jlaffaye/ftp/teams",
            "hooks_url": "https://api.github.com/repos/jlaffaye/ftp/hooks",
            "issue_events_url": "https://api.github.com/repos/jlaffaye/ftp/issues/events{/number}",
            "events_url": "https://api.github.com/repos/jlaffaye/ftp/events",
            "assignees_url": "https://api.github.com/repos/jlaffaye/ftp/assignees{/user}",
            "branches_url": "https://api.github.com/repos/jlaffaye/ftp/branches{/branch}",
            "tags_url": "https://api.github.com/repos/jlaffaye/ftp/tags",
            "blobs_url": "https://api.github.com/repos/jlaffaye/ftp/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/jlaffaye/ftp/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/jlaffaye/ftp/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/jlaffaye/ftp/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/jlaffaye/ftp/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/jlaffaye/ftp/languages",
            "stargazers_url": "https://api.github.com/repos/jlaffaye/ftp/stargazers",
            "contributors_url": "https://api.github.com/repos/jlaffaye/ftp/contributors",
            "subscribers_url": "https://api.github.com/repos/jlaffaye/ftp/subscribers",
            "subscription_url": "https://api.github.com/repos/jlaffaye/ftp/subscription",
            "commits_url": "https://api.github.com/repos/jlaffaye/ftp/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/jlaffaye/ftp/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/jlaffaye/ftp/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/jlaffaye/ftp/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/jlaffaye/ftp/contents/{+path}",
            "compare_url": "https://api.github.com/repos/jlaffaye/ftp/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/jlaffaye/ftp/merges",
            "archive_url": "https://api.github.com/repos/jlaffaye/ftp/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/jlaffaye/ftp/downloads",
            "issues_url": "https://api.github.com/repos/jlaffaye/ftp/issues{/number}",
            "pulls_url": "https://api.github.com/repos/jlaffaye/ftp/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/jlaffaye/ftp/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/jlaffaye/ftp/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/jlaffaye/ftp/labels{/name}",
            "releases_url": "https://api.github.com/repos/jlaffaye/ftp/releases{/id}",
            "deployments_url": "https://api.github.com/repos/jlaffaye/ftp/deployments",
            "created_at": "2011-05-06T18:31:51Z",
            "updated_at": "2017-05-04T15:53:46Z",
            "pushed_at": "2017-05-05T00:47:02Z",
            "git_url": "git://github.com/jlaffaye/ftp.git",
            "ssh_url": "git@github.com:jlaffaye/ftp.git",
            "clone_url": "https://github.com/jlaffaye/ftp.git",
            "svn_url": "https://github.com/jlaffaye/ftp",
            "homepage": "",
            "size": 111,
            "stargazers_count": 204,
            "watchers_count": 204,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 102,
            "mirror_url": null,
            "open_issues_count": 5,
            "forks": 102,
            "open_issues": 5,
            "watchers": 204,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/pulls/87"
          },
          "html": {
            "href": "https://github.com/jlaffaye/ftp/pull/87"
          },
          "issue": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/issues/87"
          },
          "comments": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/issues/87/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/pulls/87/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/pulls/87/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/statuses/cb362c410118164e9c6f2db0e16d095525f9ef94"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-05T01:44:14Z"
  },
  {
    "id": "5810163492",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 12418999,
      "name": "gopherjs/gopherjs",
      "url": "https://api.github.com/repos/gopherjs/gopherjs"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/gopherjs/gopherjs/issues/641",
        "repository_url": "https://api.github.com/repos/gopherjs/gopherjs",
        "labels_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/641/labels{/name}",
        "comments_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/641/comments",
        "events_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/641/events",
        "html_url": "https://github.com/gopherjs/gopherjs/issues/641",
        "id": 226275913,
        "number": 641,
        "title": "Syntactic Sugar Proposal: add js.NewObject()",
        "user": {
          "login": "theclapp",
          "id": 2324697,
          "avatar_url": "https://avatars0.githubusercontent.com/u/2324697?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/theclapp",
          "html_url": "https://github.com/theclapp",
          "followers_url": "https://api.github.com/users/theclapp/followers",
          "following_url": "https://api.github.com/users/theclapp/following{/other_user}",
          "gists_url": "https://api.github.com/users/theclapp/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/theclapp/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/theclapp/subscriptions",
          "organizations_url": "https://api.github.com/users/theclapp/orgs",
          "repos_url": "https://api.github.com/users/theclapp/repos",
          "events_url": "https://api.github.com/users/theclapp/events{/privacy}",
          "received_events_url": "https://api.github.com/users/theclapp/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 1,
        "created_at": "2017-05-04T13:11:56Z",
        "updated_at": "2017-05-04T14:54:16Z",
        "closed_at": null,
        "body": "Writing ` + "`" + `js.Global.Get(\"Object\").New()` + "`" + ` everywhere is tedious.  I usually write a ` + "`" + `current_package.NewObject()` + "`" + ` function that does the same.\r\n\r\nI propose adding ` + "`" + `NewObject()` + "`" + ` to the ` + "`" + `js` + "`" + ` package.\r\n\r\nAlternatively: is there a better way around this?  Maybe I should just ` + "`" + `var Object = js.Global.Get(\"Object\")` + "`" + ` in every package and leave it at that?  Then I could say ` + "`" + `Object.New()` + "`" + ` which is even shorter than ` + "`" + `js.NewObject()` + "`" + `\r\n\r\nWhat's your favorite solution to this (admittedly minor) issue?"
      },
      "comment": {
        "url": "https://api.github.com/repos/gopherjs/gopherjs/issues/comments/299209615",
        "html_url": "https://github.com/gopherjs/gopherjs/issues/641#issuecomment-299209615",
        "issue_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/641",
        "id": 299209615,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-04T14:54:16Z",
        "updated_at": "2017-05-04T14:54:16Z",
        "body": "> What's your favorite solution to this (admittedly minor) issue?\r\n\r\nMy favorite solution is to create fewer JavaScript objects. 😛"
      }
    },
    "public": true,
    "created_at": "2017-05-04T14:54:16Z",
    "org": {
      "id": 6654647,
      "login": "gopherjs",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/gopherjs",
      "avatar_url": "https://avatars.githubusercontent.com/u/6654647?"
    }
  },
  {
    "id": "5809005976",
    "type": "IssuesEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "action": "opened",
      "issue": {
        "url": "https://api.github.com/repos/go-gl/example/issues/62",
        "repository_url": "https://api.github.com/repos/go-gl/example",
        "labels_url": "https://api.github.com/repos/go-gl/example/issues/62/labels{/name}",
        "comments_url": "https://api.github.com/repos/go-gl/example/issues/62/comments",
        "events_url": "https://api.github.com/repos/go-gl/example/issues/62/events",
        "html_url": "https://github.com/go-gl/example/issues/62",
        "id": 226262945,
        "number": 62,
        "title": "Specify permissive license.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 0,
        "created_at": "2017-05-04T12:21:33Z",
        "updated_at": "2017-05-04T12:21:33Z",
        "closed_at": null,
        "body": "We should make it clear that anyone can copy paste code from examples and not feel bad or uncertain about being able to do so. That's one of the reasons the examples exist.\r\n\r\nWhat's a good fit? MIT is permissive, but it makes people have to preserve copyright notice and stuff. Public domain perhaps? Or is there a better solution?"
      }
    },
    "public": true,
    "created_at": "2017-05-04T12:21:33Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5806803859",
    "type": "IssuesEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 23096959,
      "name": "golang/go",
      "url": "https://api.github.com/repos/golang/go"
    },
    "payload": {
      "action": "opened",
      "issue": {
        "url": "https://api.github.com/repos/golang/go/issues/20236",
        "repository_url": "https://api.github.com/repos/golang/go",
        "labels_url": "https://api.github.com/repos/golang/go/issues/20236/labels{/name}",
        "comments_url": "https://api.github.com/repos/golang/go/issues/20236/comments",
        "events_url": "https://api.github.com/repos/golang/go/issues/20236/events",
        "html_url": "https://github.com/golang/go/issues/20236",
        "id": 226177579,
        "number": 20236,
        "title": "x/build/maintner: inconsistent/not idiomatic spelling of GitHub in two identifiers",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 223401461,
            "url": "https://api.github.com/repos/golang/go/labels/Builders",
            "name": "Builders",
            "color": "ededed",
            "default": false
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 0,
        "created_at": "2017-05-04T04:53:12Z",
        "updated_at": "2017-05-04T04:53:12Z",
        "closed_at": null,
        "body": "This is a minor issue. It's also trivial to fix if a minor breaking API change is acceptable (IIRC x/build API is not yet stable, please correct if wrong). It's easier to resolve this sooner rather than later, before it has more users.\r\n\r\nMost of the identifiers use \"GitHub\" or \"github\" spelling, which is correct and consistent:\r\n\r\n- ` + "`" + `type GitHub` + "`" + `\r\n- ` + "`" + `type GitHubUser` + "`" + `\r\n- ` + "`" + `type GitHubIssue` + "`" + `\r\n- ` + "`" + `type GitHubLabel` + "`" + `\r\n- ` + "`" + `type GitHubMilestone` + "`" + `\r\n- ` + "`" + `type GitHubComment` + "`" + `\r\n- ` + "`" + `type GitHubIssueEvent` + "`" + `\r\n- ` + "`" + `type GitHubIssueRef` + "`" + `\r\n\r\nBut 2 identifiers use \"Github\", which is neither:\r\n\r\n- ` + "`" + `type GithubRepoID` + "`" + `\r\n- ` + "`" + `func (*Corpus) TrackGithub` + "`" + `\r\n\r\nThey should be renamed to use \"GitHub\", if possible.\r\n\r\nRationale: https://dmitri.shuralyov.com/idiomatic-go#for-brands-or-words-with-more-than-1-capital-letter-lowercase-all-letters.\r\n\r\nReferences: https://github.com/logos, https://en.wikipedia.org/wiki/GitHub.\r\n\r\n/cc @bradfitz"
      }
    },
    "public": true,
    "created_at": "2017-05-04T04:53:14Z",
    "org": {
      "id": 4314092,
      "login": "golang",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/golang",
      "avatar_url": "https://avatars.githubusercontent.com/u/4314092?"
    }
  },
  {
    "id": "5805065798",
    "type": "WatchEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 34808241,
      "name": "WebAssembly/design",
      "url": "https://api.github.com/repos/WebAssembly/design"
    },
    "payload": {
      "action": "started"
    },
    "public": true,
    "created_at": "2017-05-03T21:20:44Z",
    "org": {
      "id": 11578470,
      "login": "WebAssembly",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/WebAssembly",
      "avatar_url": "https://avatars.githubusercontent.com/u/11578470?"
    }
  },
  {
    "id": "5804534086",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 23096959,
      "name": "golang/go",
      "url": "https://api.github.com/repos/golang/go"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/golang/go/issues/20223",
        "repository_url": "https://api.github.com/repos/golang/go",
        "labels_url": "https://api.github.com/repos/golang/go/issues/20223/labels{/name}",
        "comments_url": "https://api.github.com/repos/golang/go/issues/20223/comments",
        "events_url": "https://api.github.com/repos/golang/go/issues/20223/events",
        "html_url": "https://github.com/golang/go/issues/20223",
        "id": 226064375,
        "number": 20223,
        "title": "cmd/go: go test should not clutter output with \"no test files\"",
        "user": {
          "login": "joelpresence",
          "id": 12057689,
          "avatar_url": "https://avatars1.githubusercontent.com/u/12057689?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/joelpresence",
          "html_url": "https://github.com/joelpresence",
          "followers_url": "https://api.github.com/users/joelpresence/followers",
          "following_url": "https://api.github.com/users/joelpresence/following{/other_user}",
          "gists_url": "https://api.github.com/users/joelpresence/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/joelpresence/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/joelpresence/subscriptions",
          "organizations_url": "https://api.github.com/users/joelpresence/orgs",
          "repos_url": "https://api.github.com/users/joelpresence/repos",
          "events_url": "https://api.github.com/users/joelpresence/events{/privacy}",
          "received_events_url": "https://api.github.com/users/joelpresence/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 373401956,
            "url": "https://api.github.com/repos/golang/go/labels/NeedsDecision",
            "name": "NeedsDecision",
            "color": "ededed",
            "default": false
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": {
          "url": "https://api.github.com/repos/golang/go/milestones/56",
          "html_url": "https://github.com/golang/go/milestone/56",
          "labels_url": "https://api.github.com/repos/golang/go/milestones/56/labels",
          "id": 2473074,
          "number": 56,
          "title": "Go1.10",
          "description": "",
          "creator": {
            "login": "rsc",
            "id": 104030,
            "avatar_url": "https://avatars2.githubusercontent.com/u/104030?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/rsc",
            "html_url": "https://github.com/rsc",
            "followers_url": "https://api.github.com/users/rsc/followers",
            "following_url": "https://api.github.com/users/rsc/following{/other_user}",
            "gists_url": "https://api.github.com/users/rsc/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/rsc/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/rsc/subscriptions",
            "organizations_url": "https://api.github.com/users/rsc/orgs",
            "repos_url": "https://api.github.com/users/rsc/repos",
            "events_url": "https://api.github.com/users/rsc/events{/privacy}",
            "received_events_url": "https://api.github.com/users/rsc/received_events",
            "type": "User",
            "site_admin": false
          },
          "open_issues": 23,
          "closed_issues": 0,
          "state": "open",
          "created_at": "2017-04-21T19:22:29Z",
          "updated_at": "2017-05-03T18:05:31Z",
          "due_on": "2018-01-31T08:00:00Z",
          "closed_at": null
        },
        "comments": 5,
        "created_at": "2017-05-03T17:50:33Z",
        "updated_at": "2017-05-03T20:04:13Z",
        "closed_at": null,
        "body": "Please answer these questions before submitting your issue. Thanks!\r\n\r\n### What version of Go are you using (` + "`" + `go version` + "`" + `)?\r\ngo version go1.8 darwin/amd64\r\n\r\n### What operating system and processor architecture are you using (` + "`" + `go env` + "`" + `)?\r\namd64, darwin\r\n\r\n### What did you do?\r\nbash> cd ~/go/src/myproject\r\nbash> go test github.com/presencelabs/...\r\n...\r\ngo test outputs some useful test results like\r\nok  \tgithub.com/presencelabs/ourapp/apiserver/apiservercore/rendermodels/tests\t0.024s\r\n...\r\ngo test outputs a lot of unuseful test results like\r\n?   \tgithub.com/presencelabs/ourapp/apiserver/apiservercore/service\t[no test files]\r\n\r\nIf possible, provide a recipe for reproducing the error.\r\nA complete runnable program is good.\r\nA link on play.golang.org is best.\r\n\r\n\r\n### What did you expect to see?\r\nI only want to see output about which tests ran and which passed and which failed.  I do **NOT** care about packages or dirs that have no tests in them.\r\n\r\n### What did you see instead?\r\nI don't care about the directories/packages with no test files.  I know that they don't have any test files.  They are not meant to have any test files since we put our test files in subdirs called ` + "`" + `test` + "`" + `.  Telling me repeatedly that these dirs have no test files clutters the test output and obscures the important information like which tests actually ran and which passed and which failed.\r\n\r\nTelling me that a dir has no test files should be left to the coverage tool/option.  Either ` + "`" + `go test` + "`" + ` should NOT log dirs/packages that have no tests by default, or there should be an option to skip that logging as in ` + "`" + `--no-warn-no-tests` + "`" + ` or similar.\r\n\r\nI'm happy to help with a PR if there's interest.  But right now, all this clutter about no tests is really reducing our productivity and we need to run tests like ` + "`" + `clear; go test github.com/presencelabs/... | grep -v \"no test files\"` + "`" + ` which is cumbersome.\r\n\r\nBy the way, we love go!  Thanks for your hard work on it.  :-)  I'm not meaning to whine, I just want to make go even better.\r\n\r\n\r\n"
      },
      "comment": {
        "url": "https://api.github.com/repos/golang/go/issues/comments/299019684",
        "html_url": "https://github.com/golang/go/issues/20223#issuecomment-299019684",
        "issue_url": "https://api.github.com/repos/golang/go/issues/20223",
        "id": 299019684,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-03T20:04:13Z",
        "updated_at": "2017-05-03T20:04:13Z",
        "body": "> Actually, my mistake, my tests are in a subdir/subpackage called ` + "`" + `tests` + "`" + ` not ` + "`" + `test` + "`" + ` so the command ` + "`" + `go test github.com/presencelabs/.../tests` + "`" + ` works just fine and only logs actual tests! ... I have a working solution for my needs right now\r\n\r\nGlad to hear that! 👍\r\n\r\n> I still would like to see this behavior as at least an option for ` + "`" + `go test` + "`" + ` ... Thoughts?\r\n\r\nMy personal preference is to set a really high bar for inclusion of flags/options, and aim to have as few as possible. Existing ones are rarely removed. But each one adds some overhead to the list of options people need to be aware of, diluting the value offered by other flags. In an ideal world, only the absolutely critical and useful flags would exist.\r\n\r\nThis is not a flag I'd want added, since I suspect its value offered would not warrant the cost of its inclusion. It's easy to filter out unwanted output, either by not including it in the ` + "`" + `go test` + "`" + ` arguments, or by using something like ` + "`" + `| grep -v \"unwanted\"` + "`" + `, or a custom tool for formatting test output in a way you want."
      }
    },
    "public": true,
    "created_at": "2017-05-03T20:04:15Z",
    "org": {
      "id": 4314092,
      "login": "golang",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/golang",
      "avatar_url": "https://avatars.githubusercontent.com/u/4314092?"
    }
  },
  {
    "id": "5804426417",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 23096959,
      "name": "golang/go",
      "url": "https://api.github.com/repos/golang/go"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/golang/go/issues/20223",
        "repository_url": "https://api.github.com/repos/golang/go",
        "labels_url": "https://api.github.com/repos/golang/go/issues/20223/labels{/name}",
        "comments_url": "https://api.github.com/repos/golang/go/issues/20223/comments",
        "events_url": "https://api.github.com/repos/golang/go/issues/20223/events",
        "html_url": "https://github.com/golang/go/issues/20223",
        "id": 226064375,
        "number": 20223,
        "title": "cmd/go: go test should not clutter output with \"no test files\"",
        "user": {
          "login": "joelpresence",
          "id": 12057689,
          "avatar_url": "https://avatars1.githubusercontent.com/u/12057689?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/joelpresence",
          "html_url": "https://github.com/joelpresence",
          "followers_url": "https://api.github.com/users/joelpresence/followers",
          "following_url": "https://api.github.com/users/joelpresence/following{/other_user}",
          "gists_url": "https://api.github.com/users/joelpresence/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/joelpresence/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/joelpresence/subscriptions",
          "organizations_url": "https://api.github.com/users/joelpresence/orgs",
          "repos_url": "https://api.github.com/users/joelpresence/repos",
          "events_url": "https://api.github.com/users/joelpresence/events{/privacy}",
          "received_events_url": "https://api.github.com/users/joelpresence/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 373401956,
            "url": "https://api.github.com/repos/golang/go/labels/NeedsDecision",
            "name": "NeedsDecision",
            "color": "ededed",
            "default": false
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": {
          "url": "https://api.github.com/repos/golang/go/milestones/56",
          "html_url": "https://github.com/golang/go/milestone/56",
          "labels_url": "https://api.github.com/repos/golang/go/milestones/56/labels",
          "id": 2473074,
          "number": 56,
          "title": "Go1.10",
          "description": "",
          "creator": {
            "login": "rsc",
            "id": 104030,
            "avatar_url": "https://avatars2.githubusercontent.com/u/104030?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/rsc",
            "html_url": "https://github.com/rsc",
            "followers_url": "https://api.github.com/users/rsc/followers",
            "following_url": "https://api.github.com/users/rsc/following{/other_user}",
            "gists_url": "https://api.github.com/users/rsc/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/rsc/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/rsc/subscriptions",
            "organizations_url": "https://api.github.com/users/rsc/orgs",
            "repos_url": "https://api.github.com/users/rsc/repos",
            "events_url": "https://api.github.com/users/rsc/events{/privacy}",
            "received_events_url": "https://api.github.com/users/rsc/received_events",
            "type": "User",
            "site_admin": false
          },
          "open_issues": 23,
          "closed_issues": 0,
          "state": "open",
          "created_at": "2017-04-21T19:22:29Z",
          "updated_at": "2017-05-03T18:05:31Z",
          "due_on": "2018-01-31T08:00:00Z",
          "closed_at": null
        },
        "comments": 3,
        "created_at": "2017-05-03T17:50:33Z",
        "updated_at": "2017-05-03T19:48:12Z",
        "closed_at": null,
        "body": "Please answer these questions before submitting your issue. Thanks!\r\n\r\n### What version of Go are you using (` + "`" + `go version` + "`" + `)?\r\ngo version go1.8 darwin/amd64\r\n\r\n### What operating system and processor architecture are you using (` + "`" + `go env` + "`" + `)?\r\namd64, darwin\r\n\r\n### What did you do?\r\nbash> cd ~/go/src/myproject\r\nbash> go test github.com/presencelabs/...\r\n...\r\ngo test outputs some useful test results like\r\nok  \tgithub.com/presencelabs/ourapp/apiserver/apiservercore/rendermodels/tests\t0.024s\r\n...\r\ngo test outputs a lot of unuseful test results like\r\n?   \tgithub.com/presencelabs/ourapp/apiserver/apiservercore/service\t[no test files]\r\n\r\nIf possible, provide a recipe for reproducing the error.\r\nA complete runnable program is good.\r\nA link on play.golang.org is best.\r\n\r\n\r\n### What did you expect to see?\r\nI only want to see output about which tests ran and which passed and which failed.  I do **NOT** care about packages or dirs that have no tests in them.\r\n\r\n### What did you see instead?\r\nI don't care about the directories/packages with no test files.  I know that they don't have any test files.  They are not meant to have any test files since we put our test files in subdirs called ` + "`" + `test` + "`" + `.  Telling me repeatedly that these dirs have no test files clutters the test output and obscures the important information like which tests actually ran and which passed and which failed.\r\n\r\nTelling me that a dir has no test files should be left to the coverage tool/option.  Either ` + "`" + `go test` + "`" + ` should NOT log dirs/packages that have no tests by default, or there should be an option to skip that logging as in ` + "`" + `--no-warn-no-tests` + "`" + ` or similar.\r\n\r\nI'm happy to help with a PR if there's interest.  But right now, all this clutter about no tests is really reducing our productivity and we need to run tests like ` + "`" + `clear; go test github.com/presencelabs/... | grep -v \"no test files\"` + "`" + ` which is cumbersome.\r\n\r\nBy the way, we love go!  Thanks for your hard work on it.  :-)  I'm not meaning to whine, I just want to make go even better.\r\n\r\n\r\n"
      },
      "comment": {
        "url": "https://api.github.com/repos/golang/go/issues/comments/299015826",
        "html_url": "https://github.com/golang/go/issues/20223#issuecomment-299015826",
        "issue_url": "https://api.github.com/repos/golang/go/issues/20223",
        "id": 299015826,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-03T19:48:12Z",
        "updated_at": "2017-05-03T19:48:12Z",
        "body": "> Also, I tried ` + "`" + `github.com/presencelabs/.../test` + "`" + ` but it failed with:\r\n>\r\n> ` + "`" + `warning: \"github.com/presencelabs/.../test\" matched no packages` + "`" + `\r\n\r\nThat means you don't have any packages that match that import path pattern. It looks like they're private repos, so I can't help you without knowing what they are.\r\n\r\nYou can read more about the import path patterns at https://golang.org/cmd/go/#hdr-Description_of_package_lists.\r\n\r\nAs an example, you can also try ` + "`" + `go test net/...test` + "`" + ` to test all packages that end with ` + "`" + `test` + "`" + ` inside [` + "`" + `net` + "`" + `](https://godoc.org/net#pkg-subdirectories):\r\n\r\n` + "```" + `\r\n$ go test net/...test\r\nok  \tnet/http/httptest\t0.012s\r\nok  \tnet/internal/socktest\t0.007s\r\n` + "```" + `\r\n\r\n> I would respectfully disagree with your statement \"But the point is you shouldn't run go test on packages that you don't want to test\" and revise it to be \"But the point is go test shouldn't try to test any packages that don't contain tests\".\r\n\r\nFair enough. I guess it's a matter of opinion/preference/what one is used to. I can see both ways can make sense, in their own way.\r\n\r\nHowever, ` + "`" + `go test` + "`" + ` has always included all Go packages since 1.0 (as far as I know), regardless if they have test files or not, so that's why I'm used to and happy with its behavior.\r\n\r\n> I already have ` + "`" + `go build` + "`" + ` or my IDE to do that.  I view ` + "`" + `go test` + "`" + ` as a way to verify that my tests pass.\r\n\r\nUnlike ` + "`" + `go test` + "`" + `, ` + "`" + `go build` + "`" + ` has side-effects (it can potentially write files to your current directory), so it's not a great command to check if everything works after you've done a refactor. I don't think having an IDE should be a requirement to test that packages build successfully either."
      }
    },
    "public": true,
    "created_at": "2017-05-03T19:48:14Z",
    "org": {
      "id": 4314092,
      "login": "golang",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/golang",
      "avatar_url": "https://avatars.githubusercontent.com/u/4314092?"
    }
  },
  {
    "id": "5804206833",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1812190,
      "name": "russross/blackfriday",
      "url": "https://api.github.com/repos/russross/blackfriday"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/russross/blackfriday/issues/352",
        "repository_url": "https://api.github.com/repos/russross/blackfriday",
        "labels_url": "https://api.github.com/repos/russross/blackfriday/issues/352/labels{/name}",
        "comments_url": "https://api.github.com/repos/russross/blackfriday/issues/352/comments",
        "events_url": "https://api.github.com/repos/russross/blackfriday/issues/352/events",
        "html_url": "https://github.com/russross/blackfriday/pull/352",
        "id": 225592550,
        "number": 352,
        "title": "Document SanitizedAnchorName algorithm, copy implementation.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 408764619,
            "url": "https://api.github.com/repos/russross/blackfriday/labels/v1",
            "name": "v1",
            "color": "bfdadc",
            "default": false
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 5,
        "created_at": "2017-05-02T05:15:41Z",
        "updated_at": "2017-05-03T19:14:26Z",
        "closed_at": null,
        "pull_request": {
          "url": "https://api.github.com/repos/russross/blackfriday/pulls/352",
          "html_url": "https://github.com/russross/blackfriday/pull/352",
          "diff_url": "https://github.com/russross/blackfriday/pull/352.diff",
          "patch_url": "https://github.com/russross/blackfriday/pull/352.patch"
        },
        "body": "The goal of this change is to reduce number of non-standard library packages (repositories) that ` + "`" + `blackfriday` + "`" + ` imports [from 1](https://godoc.org/github.com/russross/blackfriday?import-graph&hide=2) to 0, and in turn, reduce the cost of importing ` + "`" + `blackfriday` + "`" + ` into other projects.\r\n\r\nDo so by documenting the algorithm of ` + "`" + `SanitizedAnchorName` + "`" + `, and include a copy of the small function inside ` + "`" + `blackfriday` + "`" + ` itself. The same functionality continues to be available in the original location, [` + "`" + `github.com/shurcooL/sanitized_anchor_name.Create` + "`" + `](https://godoc.org/github.com/shurcooL/sanitized_anchor_name#Create). It can be used by existing users and those that look for a small package, and don't need all of ` + "`" + `blackfriday` + "`" + ` functionality. Existing users of ` + "`" + `blackfriday` + "`" + ` can use the new ` + "`" + `SanitizedAnchorName` + "`" + ` function directly and avoid an extra package import.\r\n\r\nResolves #350."
      },
      "comment": {
        "url": "https://api.github.com/repos/russross/blackfriday/issues/comments/299007789",
        "html_url": "https://github.com/russross/blackfriday/pull/352#issuecomment-299007789",
        "issue_url": "https://api.github.com/repos/russross/blackfriday/issues/352",
        "id": 299007789,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-03T19:14:26Z",
        "updated_at": "2017-05-03T19:14:26Z",
        "body": "@adg, how does this solution for #350 look to you?"
      }
    },
    "public": true,
    "created_at": "2017-05-03T19:14:27Z"
  },
  {
    "id": "5804167482",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 23096959,
      "name": "golang/go",
      "url": "https://api.github.com/repos/golang/go"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/golang/go/issues/20223",
        "repository_url": "https://api.github.com/repos/golang/go",
        "labels_url": "https://api.github.com/repos/golang/go/issues/20223/labels{/name}",
        "comments_url": "https://api.github.com/repos/golang/go/issues/20223/comments",
        "events_url": "https://api.github.com/repos/golang/go/issues/20223/events",
        "html_url": "https://github.com/golang/go/issues/20223",
        "id": 226064375,
        "number": 20223,
        "title": "cmd/go: go test should not clutter output with \"no test files\"",
        "user": {
          "login": "joelpresence",
          "id": 12057689,
          "avatar_url": "https://avatars1.githubusercontent.com/u/12057689?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/joelpresence",
          "html_url": "https://github.com/joelpresence",
          "followers_url": "https://api.github.com/users/joelpresence/followers",
          "following_url": "https://api.github.com/users/joelpresence/following{/other_user}",
          "gists_url": "https://api.github.com/users/joelpresence/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/joelpresence/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/joelpresence/subscriptions",
          "organizations_url": "https://api.github.com/users/joelpresence/orgs",
          "repos_url": "https://api.github.com/users/joelpresence/repos",
          "events_url": "https://api.github.com/users/joelpresence/events{/privacy}",
          "received_events_url": "https://api.github.com/users/joelpresence/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 373401956,
            "url": "https://api.github.com/repos/golang/go/labels/NeedsDecision",
            "name": "NeedsDecision",
            "color": "ededed",
            "default": false
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": {
          "url": "https://api.github.com/repos/golang/go/milestones/56",
          "html_url": "https://github.com/golang/go/milestone/56",
          "labels_url": "https://api.github.com/repos/golang/go/milestones/56/labels",
          "id": 2473074,
          "number": 56,
          "title": "Go1.10",
          "description": "",
          "creator": {
            "login": "rsc",
            "id": 104030,
            "avatar_url": "https://avatars2.githubusercontent.com/u/104030?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/rsc",
            "html_url": "https://github.com/rsc",
            "followers_url": "https://api.github.com/users/rsc/followers",
            "following_url": "https://api.github.com/users/rsc/following{/other_user}",
            "gists_url": "https://api.github.com/users/rsc/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/rsc/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/rsc/subscriptions",
            "organizations_url": "https://api.github.com/users/rsc/orgs",
            "repos_url": "https://api.github.com/users/rsc/repos",
            "events_url": "https://api.github.com/users/rsc/events{/privacy}",
            "received_events_url": "https://api.github.com/users/rsc/received_events",
            "type": "User",
            "site_admin": false
          },
          "open_issues": 23,
          "closed_issues": 0,
          "state": "open",
          "created_at": "2017-04-21T19:22:29Z",
          "updated_at": "2017-05-03T18:05:31Z",
          "due_on": "2018-01-31T08:00:00Z",
          "closed_at": null
        },
        "comments": 1,
        "created_at": "2017-05-03T17:50:33Z",
        "updated_at": "2017-05-03T19:08:29Z",
        "closed_at": null,
        "body": "Please answer these questions before submitting your issue. Thanks!\r\n\r\n### What version of Go are you using (` + "`" + `go version` + "`" + `)?\r\ngo version go1.8 darwin/amd64\r\n\r\n### What operating system and processor architecture are you using (` + "`" + `go env` + "`" + `)?\r\namd64, darwin\r\n\r\n### What did you do?\r\nbash> cd ~/go/src/myproject\r\nbash> go test github.com/presencelabs/...\r\n...\r\ngo test outputs some useful test results like\r\nok  \tgithub.com/presencelabs/ourapp/apiserver/apiservercore/rendermodels/tests\t0.024s\r\n...\r\ngo test outputs a lot of unuseful test results like\r\n?   \tgithub.com/presencelabs/ourapp/apiserver/apiservercore/service\t[no test files]\r\n\r\nIf possible, provide a recipe for reproducing the error.\r\nA complete runnable program is good.\r\nA link on play.golang.org is best.\r\n\r\n\r\n### What did you expect to see?\r\nI only want to see output about which tests ran and which passed and which failed.  I do **NOT** care about packages or dirs that have no tests in them.\r\n\r\n### What did you see instead?\r\nI don't care about the directories/packages with no test files.  I know that they don't have any test files.  They are not meant to have any test files since we put our test files in subdirs called ` + "`" + `test` + "`" + `.  Telling me repeatedly that these dirs have no test files clutters the test output and obscures the important information like which tests actually ran and which passed and which failed.\r\n\r\nTelling me that a dir has no test files should be left to the coverage tool/option.  Either ` + "`" + `go test` + "`" + ` should NOT log dirs/packages that have no tests by default, or there should be an option to skip that logging as in ` + "`" + `--no-warn-no-tests` + "`" + ` or similar.\r\n\r\nI'm happy to help with a PR if there's interest.  But right now, all this clutter about no tests is really reducing our productivity and we need to run tests like ` + "`" + `clear; go test github.com/presencelabs/... | grep -v \"no test files\"` + "`" + ` which is cumbersome.\r\n\r\nBy the way, we love go!  Thanks for your hard work on it.  :-)  I'm not meaning to whine, I just want to make go even better.\r\n\r\n\r\n"
      },
      "comment": {
        "url": "https://api.github.com/repos/golang/go/issues/comments/299006279",
        "html_url": "https://github.com/golang/go/issues/20223#issuecomment-299006279",
        "issue_url": "https://api.github.com/repos/golang/go/issues/20223",
        "id": 299006279,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-03T19:08:29Z",
        "updated_at": "2017-05-03T19:08:29Z",
        "body": "As I understand, the purpose of ` + "`" + `go test` + "`" + ` is to do two things. First, test that the package builds without errors, and second, that tests/examples (maybe even benchmarks, with -bench flag) are executed without failing. Examples without \"// Output:\" comments are only compiled, not even executed.\r\n\r\nGo packages that have no test files can still be tested for build errors. So when you see ` + "`" + `?` + "`" + ` and ` + "`" + `[no test files]` + "`" + `, it just means the package compiles successfully but there weren't any test files to use (perhaps because of mismatching build tags). I find this very useful, because not all my Go packages have tests, but I still want to know they were tested for build errors, at the very least.\r\n\r\n> I don't care about the directories/packages with no test files. I know that they don't have any test files. They are not meant to have any test files since we put our test files in subdirs called ` + "`" + `test` + "`" + `. \r\n\r\nYou said you did ` + "`" + `go test github.com/presencelabs/...` + "`" + `. The command did what you asked it to, and tested all packages, since you specified ` + "`" + `/...` + "`" + ` suffix in the import path pattern.\r\n\r\nIf you want to test only packages named ` + "`" + `test` + "`" + `, rather than all, then you should specify that as an argument to ` + "`" + `go test` + "`" + `.\r\n\r\nFor example:\r\n\r\n` + "```" + `\r\ngo test github.com/presencelabs/something/test\r\n` + "```" + `\r\n\r\nYou can even get creative with patterns and do something like ` + "`" + `go test github.com/presencelabs/.../test` + "`" + ` to test all packages named ` + "`" + `test` + "`" + ` inside ` + "`" + `github.com/presencelabs` + "`" + `.\r\n\r\nBut the point is you shouldn't run ` + "`" + `go test` + "`" + ` on packages that you don't want to test."
      }
    },
    "public": true,
    "created_at": "2017-05-03T19:08:31Z",
    "org": {
      "id": 4314092,
      "login": "golang",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/golang",
      "avatar_url": "https://avatars.githubusercontent.com/u/4314092?"
    }
  },
  {
    "id": "5803988532",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1812190,
      "name": "russross/blackfriday",
      "url": "https://api.github.com/repos/russross/blackfriday"
    },
    "payload": {
      "push_id": 1717626546,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/document-and-copy-sanitized_anchor_name",
      "head": "5a7aac69f11f6a9b82b8898dc619531915ab7191",
      "before": "a417c2043477a438a7e80708786a79c58926cb9a",
      "commits": [
        {
          "sha": "5a7aac69f11f6a9b82b8898dc619531915ab7191",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "README: Link to anchor name specification in godoc.\n\nThis way, the specification has a canonical location and doesn't need\nto be kept in sync between the README and godoc.",
          "distinct": true,
          "url": "https://api.github.com/repos/russross/blackfriday/commits/5a7aac69f11f6a9b82b8898dc619531915ab7191"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-03T18:42:37Z"
  },
  {
    "id": "5803902397",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10151943,
      "name": "go-gl/glfw",
      "url": "https://api.github.com/repos/go-gl/glfw"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/go-gl/glfw/pulls/comments/114619579",
        "pull_request_review_id": 36101563,
        "id": 114619579,
        "diff_hunk": "@@ -19,3 +19,7 @@ script:\n   - diff -u <(echo -n) <(gofmt -d -s .)\n   - go tool vet .\n   - go test -v -race ./v3.2/...\n+  - go get -t -v ./v3.3/...\n+  - diff -u <(echo -n) <(gofmt -d -s .)\n+  - go tool vet .\n+  - go test -v -race ./v3.3/...",
        "path": ".travis.yml",
        "position": 7,
        "original_position": 7,
        "commit_id": "a4e9f1dc094df58581ef040cb29891a2c23fb66f",
        "original_commit_id": "397dfe616378c07a92ec5a8cb7fbee7edf31db45",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "You can merge these lines. It will become:\r\n\r\n` + "```" + `yml\r\nscript:\r\n  - go get -t -v ./v3.2/... ./v3.3/...\r\n  - diff -u <(echo -n) <(gofmt -d -s .)\r\n  - go tool vet .\r\n  - go test -v -race ./v3.2/... ./v3.3/...\r\n` + "```" + `",
        "created_at": "2017-05-03T18:30:11Z",
        "updated_at": "2017-05-03T18:30:11Z",
        "html_url": "https://github.com/go-gl/glfw/pull/196#discussion_r114619579",
        "pull_request_url": "https://api.github.com/repos/go-gl/glfw/pulls/196",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/go-gl/glfw/pulls/comments/114619579"
          },
          "html": {
            "href": "https://github.com/go-gl/glfw/pull/196#discussion_r114619579"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/go-gl/glfw/pulls/196"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/go-gl/glfw/pulls/196",
        "id": 118815284,
        "html_url": "https://github.com/go-gl/glfw/pull/196",
        "diff_url": "https://github.com/go-gl/glfw/pull/196.diff",
        "patch_url": "https://github.com/go-gl/glfw/pull/196.patch",
        "issue_url": "https://api.github.com/repos/go-gl/glfw/issues/196",
        "number": 196,
        "state": "open",
        "locked": false,
        "title": "initial add of master branch of glfw v3.3 beta",
        "user": {
          "login": "mattkanwisher",
          "id": 3032,
          "avatar_url": "https://avatars3.githubusercontent.com/u/3032?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/mattkanwisher",
          "html_url": "https://github.com/mattkanwisher",
          "followers_url": "https://api.github.com/users/mattkanwisher/followers",
          "following_url": "https://api.github.com/users/mattkanwisher/following{/other_user}",
          "gists_url": "https://api.github.com/users/mattkanwisher/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/mattkanwisher/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/mattkanwisher/subscriptions",
          "organizations_url": "https://api.github.com/users/mattkanwisher/orgs",
          "repos_url": "https://api.github.com/users/mattkanwisher/repos",
          "events_url": "https://api.github.com/users/mattkanwisher/events{/privacy}",
          "received_events_url": "https://api.github.com/users/mattkanwisher/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "Wanted to have a clean checkout of glfw without any new Apis in initial PR. This has been tested working on Darwin, minor tweaks to linux or windows compiles may need to come in the next PRs.",
        "created_at": "2017-05-03T17:37:40Z",
        "updated_at": "2017-05-03T18:30:11Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "81b13653b2f3d9fbbee09e508c56e0570fad9649",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/go-gl/glfw/pulls/196/commits",
        "review_comments_url": "https://api.github.com/repos/go-gl/glfw/pulls/196/comments",
        "review_comment_url": "https://api.github.com/repos/go-gl/glfw/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/go-gl/glfw/issues/196/comments",
        "statuses_url": "https://api.github.com/repos/go-gl/glfw/statuses/a4e9f1dc094df58581ef040cb29891a2c23fb66f",
        "head": {
          "label": "mattkanwisher:v33",
          "ref": "v33",
          "sha": "a4e9f1dc094df58581ef040cb29891a2c23fb66f",
          "user": {
            "login": "mattkanwisher",
            "id": 3032,
            "avatar_url": "https://avatars3.githubusercontent.com/u/3032?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/mattkanwisher",
            "html_url": "https://github.com/mattkanwisher",
            "followers_url": "https://api.github.com/users/mattkanwisher/followers",
            "following_url": "https://api.github.com/users/mattkanwisher/following{/other_user}",
            "gists_url": "https://api.github.com/users/mattkanwisher/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/mattkanwisher/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/mattkanwisher/subscriptions",
            "organizations_url": "https://api.github.com/users/mattkanwisher/orgs",
            "repos_url": "https://api.github.com/users/mattkanwisher/repos",
            "events_url": "https://api.github.com/users/mattkanwisher/events{/privacy}",
            "received_events_url": "https://api.github.com/users/mattkanwisher/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 90174447,
            "name": "glfw",
            "full_name": "mattkanwisher/glfw",
            "owner": {
              "login": "mattkanwisher",
              "id": 3032,
              "avatar_url": "https://avatars3.githubusercontent.com/u/3032?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/mattkanwisher",
              "html_url": "https://github.com/mattkanwisher",
              "followers_url": "https://api.github.com/users/mattkanwisher/followers",
              "following_url": "https://api.github.com/users/mattkanwisher/following{/other_user}",
              "gists_url": "https://api.github.com/users/mattkanwisher/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/mattkanwisher/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/mattkanwisher/subscriptions",
              "organizations_url": "https://api.github.com/users/mattkanwisher/orgs",
              "repos_url": "https://api.github.com/users/mattkanwisher/repos",
              "events_url": "https://api.github.com/users/mattkanwisher/events{/privacy}",
              "received_events_url": "https://api.github.com/users/mattkanwisher/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/mattkanwisher/glfw",
            "description": "Go bindings for GLFW 3",
            "fork": true,
            "url": "https://api.github.com/repos/mattkanwisher/glfw",
            "forks_url": "https://api.github.com/repos/mattkanwisher/glfw/forks",
            "keys_url": "https://api.github.com/repos/mattkanwisher/glfw/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/mattkanwisher/glfw/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/mattkanwisher/glfw/teams",
            "hooks_url": "https://api.github.com/repos/mattkanwisher/glfw/hooks",
            "issue_events_url": "https://api.github.com/repos/mattkanwisher/glfw/issues/events{/number}",
            "events_url": "https://api.github.com/repos/mattkanwisher/glfw/events",
            "assignees_url": "https://api.github.com/repos/mattkanwisher/glfw/assignees{/user}",
            "branches_url": "https://api.github.com/repos/mattkanwisher/glfw/branches{/branch}",
            "tags_url": "https://api.github.com/repos/mattkanwisher/glfw/tags",
            "blobs_url": "https://api.github.com/repos/mattkanwisher/glfw/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/mattkanwisher/glfw/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/mattkanwisher/glfw/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/mattkanwisher/glfw/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/mattkanwisher/glfw/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/mattkanwisher/glfw/languages",
            "stargazers_url": "https://api.github.com/repos/mattkanwisher/glfw/stargazers",
            "contributors_url": "https://api.github.com/repos/mattkanwisher/glfw/contributors",
            "subscribers_url": "https://api.github.com/repos/mattkanwisher/glfw/subscribers",
            "subscription_url": "https://api.github.com/repos/mattkanwisher/glfw/subscription",
            "commits_url": "https://api.github.com/repos/mattkanwisher/glfw/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/mattkanwisher/glfw/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/mattkanwisher/glfw/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/mattkanwisher/glfw/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/mattkanwisher/glfw/contents/{+path}",
            "compare_url": "https://api.github.com/repos/mattkanwisher/glfw/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/mattkanwisher/glfw/merges",
            "archive_url": "https://api.github.com/repos/mattkanwisher/glfw/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/mattkanwisher/glfw/downloads",
            "issues_url": "https://api.github.com/repos/mattkanwisher/glfw/issues{/number}",
            "pulls_url": "https://api.github.com/repos/mattkanwisher/glfw/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/mattkanwisher/glfw/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/mattkanwisher/glfw/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/mattkanwisher/glfw/labels{/name}",
            "releases_url": "https://api.github.com/repos/mattkanwisher/glfw/releases{/id}",
            "deployments_url": "https://api.github.com/repos/mattkanwisher/glfw/deployments",
            "created_at": "2017-05-03T17:16:58Z",
            "updated_at": "2017-05-03T17:17:02Z",
            "pushed_at": "2017-05-03T17:42:54Z",
            "git_url": "git://github.com/mattkanwisher/glfw.git",
            "ssh_url": "git@github.com:mattkanwisher/glfw.git",
            "clone_url": "https://github.com/mattkanwisher/glfw.git",
            "svn_url": "https://github.com/mattkanwisher/glfw",
            "homepage": "",
            "size": 1334,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "C",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "go-gl:master",
          "ref": "master",
          "sha": "45517cf5568747f99bb4b0b4abae9fa3cd5f85ed",
          "user": {
            "login": "go-gl",
            "id": 2505184,
            "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/go-gl",
            "html_url": "https://github.com/go-gl",
            "followers_url": "https://api.github.com/users/go-gl/followers",
            "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
            "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
            "organizations_url": "https://api.github.com/users/go-gl/orgs",
            "repos_url": "https://api.github.com/users/go-gl/repos",
            "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
            "received_events_url": "https://api.github.com/users/go-gl/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 10151943,
            "name": "glfw",
            "full_name": "go-gl/glfw",
            "owner": {
              "login": "go-gl",
              "id": 2505184,
              "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/go-gl",
              "html_url": "https://github.com/go-gl",
              "followers_url": "https://api.github.com/users/go-gl/followers",
              "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
              "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
              "organizations_url": "https://api.github.com/users/go-gl/orgs",
              "repos_url": "https://api.github.com/users/go-gl/repos",
              "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
              "received_events_url": "https://api.github.com/users/go-gl/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/go-gl/glfw",
            "description": "Go bindings for GLFW 3",
            "fork": false,
            "url": "https://api.github.com/repos/go-gl/glfw",
            "forks_url": "https://api.github.com/repos/go-gl/glfw/forks",
            "keys_url": "https://api.github.com/repos/go-gl/glfw/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/go-gl/glfw/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/go-gl/glfw/teams",
            "hooks_url": "https://api.github.com/repos/go-gl/glfw/hooks",
            "issue_events_url": "https://api.github.com/repos/go-gl/glfw/issues/events{/number}",
            "events_url": "https://api.github.com/repos/go-gl/glfw/events",
            "assignees_url": "https://api.github.com/repos/go-gl/glfw/assignees{/user}",
            "branches_url": "https://api.github.com/repos/go-gl/glfw/branches{/branch}",
            "tags_url": "https://api.github.com/repos/go-gl/glfw/tags",
            "blobs_url": "https://api.github.com/repos/go-gl/glfw/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/go-gl/glfw/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/go-gl/glfw/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/go-gl/glfw/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/go-gl/glfw/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/go-gl/glfw/languages",
            "stargazers_url": "https://api.github.com/repos/go-gl/glfw/stargazers",
            "contributors_url": "https://api.github.com/repos/go-gl/glfw/contributors",
            "subscribers_url": "https://api.github.com/repos/go-gl/glfw/subscribers",
            "subscription_url": "https://api.github.com/repos/go-gl/glfw/subscription",
            "commits_url": "https://api.github.com/repos/go-gl/glfw/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/go-gl/glfw/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/go-gl/glfw/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/go-gl/glfw/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/go-gl/glfw/contents/{+path}",
            "compare_url": "https://api.github.com/repos/go-gl/glfw/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/go-gl/glfw/merges",
            "archive_url": "https://api.github.com/repos/go-gl/glfw/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/go-gl/glfw/downloads",
            "issues_url": "https://api.github.com/repos/go-gl/glfw/issues{/number}",
            "pulls_url": "https://api.github.com/repos/go-gl/glfw/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/go-gl/glfw/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/go-gl/glfw/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/go-gl/glfw/labels{/name}",
            "releases_url": "https://api.github.com/repos/go-gl/glfw/releases{/id}",
            "deployments_url": "https://api.github.com/repos/go-gl/glfw/deployments",
            "created_at": "2013-05-19T06:38:45Z",
            "updated_at": "2017-04-30T21:34:26Z",
            "pushed_at": "2017-05-03T17:42:55Z",
            "git_url": "git://github.com/go-gl/glfw.git",
            "ssh_url": "git@github.com:go-gl/glfw.git",
            "clone_url": "https://github.com/go-gl/glfw.git",
            "svn_url": "https://github.com/go-gl/glfw",
            "homepage": "",
            "size": 1334,
            "stargazers_count": 359,
            "watchers_count": 359,
            "language": "C",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 46,
            "mirror_url": null,
            "open_issues_count": 5,
            "forks": 46,
            "open_issues": 5,
            "watchers": 359,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/go-gl/glfw/pulls/196"
          },
          "html": {
            "href": "https://github.com/go-gl/glfw/pull/196"
          },
          "issue": {
            "href": "https://api.github.com/repos/go-gl/glfw/issues/196"
          },
          "comments": {
            "href": "https://api.github.com/repos/go-gl/glfw/issues/196/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/go-gl/glfw/pulls/196/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/go-gl/glfw/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/go-gl/glfw/pulls/196/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/go-gl/glfw/statuses/a4e9f1dc094df58581ef040cb29891a2c23fb66f"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-03T18:30:11Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5803608792",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1812190,
      "name": "russross/blackfriday",
      "url": "https://api.github.com/repos/russross/blackfriday"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/russross/blackfriday/issues/352",
        "repository_url": "https://api.github.com/repos/russross/blackfriday",
        "labels_url": "https://api.github.com/repos/russross/blackfriday/issues/352/labels{/name}",
        "comments_url": "https://api.github.com/repos/russross/blackfriday/issues/352/comments",
        "events_url": "https://api.github.com/repos/russross/blackfriday/issues/352/events",
        "html_url": "https://github.com/russross/blackfriday/pull/352",
        "id": 225592550,
        "number": 352,
        "title": "Document SanitizedAnchorName algorithm, copy implementation.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 408764619,
            "url": "https://api.github.com/repos/russross/blackfriday/labels/v1",
            "name": "v1",
            "color": "bfdadc",
            "default": false
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 3,
        "created_at": "2017-05-02T05:15:41Z",
        "updated_at": "2017-05-03T17:48:45Z",
        "closed_at": null,
        "pull_request": {
          "url": "https://api.github.com/repos/russross/blackfriday/pulls/352",
          "html_url": "https://github.com/russross/blackfriday/pull/352",
          "diff_url": "https://github.com/russross/blackfriday/pull/352.diff",
          "patch_url": "https://github.com/russross/blackfriday/pull/352.patch"
        },
        "body": "The goal of this change is to reduce number of non-standard library packages (repositories) that ` + "`" + `blackfriday` + "`" + ` imports [from 1](https://godoc.org/github.com/russross/blackfriday?import-graph&hide=2) to 0, and in turn, reduce the cost of importing ` + "`" + `blackfriday` + "`" + ` into other projects.\r\n\r\nDo so by documenting the algorithm of ` + "`" + `SanitizedAnchorName` + "`" + `, and include a copy of the small function inside ` + "`" + `blackfriday` + "`" + ` itself. The same functionality continues to be available in the original location, [` + "`" + `github.com/shurcooL/sanitized_anchor_name.Create` + "`" + `](https://godoc.org/github.com/shurcooL/sanitized_anchor_name#Create). It can be used by existing users and those that look for a small package, and don't need all of ` + "`" + `blackfriday` + "`" + ` functionality. Existing users of ` + "`" + `blackfriday` + "`" + ` can use the new ` + "`" + `SanitizedAnchorName` + "`" + ` function directly and avoid an extra package import.\r\n\r\nResolves #350."
      },
      "comment": {
        "url": "https://api.github.com/repos/russross/blackfriday/issues/comments/298985006",
        "html_url": "https://github.com/russross/blackfriday/pull/352#issuecomment-298985006",
        "issue_url": "https://api.github.com/repos/russross/blackfriday/issues/352",
        "id": 298985006,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-03T17:48:45Z",
        "updated_at": "2017-05-03T17:48:45Z",
        "body": "@rtfb, how do you feel about adding an exported version of ` + "`" + `SanitizedAnchorName` + "`" + ` to the ` + "`" + `blackfriday` + "`" + ` API vs keeping it unexported?\r\n\r\nAlso, if we do export it, do you have opinions on whether it should be inside ` + "`" + `blackfriday` + "`" + ` package itself, or if it can be in a small standalone subpackage (inside blackfriday repository)?"
      }
    },
    "public": true,
    "created_at": "2017-05-03T17:48:45Z"
  },
  {
    "id": "5803581907",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1812190,
      "name": "russross/blackfriday",
      "url": "https://api.github.com/repos/russross/blackfriday"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/russross/blackfriday/issues/352",
        "repository_url": "https://api.github.com/repos/russross/blackfriday",
        "labels_url": "https://api.github.com/repos/russross/blackfriday/issues/352/labels{/name}",
        "comments_url": "https://api.github.com/repos/russross/blackfriday/issues/352/comments",
        "events_url": "https://api.github.com/repos/russross/blackfriday/issues/352/events",
        "html_url": "https://github.com/russross/blackfriday/pull/352",
        "id": 225592550,
        "number": 352,
        "title": "Document SanitizedAnchorName algorithm, copy implementation.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 408764619,
            "url": "https://api.github.com/repos/russross/blackfriday/labels/v1",
            "name": "v1",
            "color": "bfdadc",
            "default": false
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 2,
        "created_at": "2017-05-02T05:15:41Z",
        "updated_at": "2017-05-03T17:44:51Z",
        "closed_at": null,
        "pull_request": {
          "url": "https://api.github.com/repos/russross/blackfriday/pulls/352",
          "html_url": "https://github.com/russross/blackfriday/pull/352",
          "diff_url": "https://github.com/russross/blackfriday/pull/352.diff",
          "patch_url": "https://github.com/russross/blackfriday/pull/352.patch"
        },
        "body": "The goal of this change is to reduce number of non-standard library packages (repositories) that ` + "`" + `blackfriday` + "`" + ` imports [from 1](https://godoc.org/github.com/russross/blackfriday?import-graph&hide=2) to 0, and in turn, reduce the cost of importing ` + "`" + `blackfriday` + "`" + ` into other projects.\r\n\r\nDo so by documenting the algorithm of ` + "`" + `SanitizedAnchorName` + "`" + `, and include a copy of the small function inside ` + "`" + `blackfriday` + "`" + ` itself. The same functionality continues to be available in the original location, [` + "`" + `github.com/shurcooL/sanitized_anchor_name.Create` + "`" + `](https://godoc.org/github.com/shurcooL/sanitized_anchor_name#Create). It can be used by existing users and those that look for a small package, and don't need all of ` + "`" + `blackfriday` + "`" + ` functionality. Existing users of ` + "`" + `blackfriday` + "`" + ` can use the new ` + "`" + `SanitizedAnchorName` + "`" + ` function directly and avoid an extra package import.\r\n\r\nResolves #350."
      },
      "comment": {
        "url": "https://api.github.com/repos/russross/blackfriday/issues/comments/298983957",
        "html_url": "https://github.com/russross/blackfriday/pull/352#issuecomment-298983957",
        "issue_url": "https://api.github.com/repos/russross/blackfriday/issues/352",
        "id": 298983957,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-03T17:44:51Z",
        "updated_at": "2017-05-03T17:44:51Z",
        "body": "> The only complaint that I have is the duplicate paragraphs in README and doc.go. Would it perhaps be better to leave the reference text in doc.go and link to it from the README?\r\n\r\nI did that based on how the [go-github](https://godoc.org/github.com/google/go-github/github) package did it. It has similar documentation in godoc and README:\r\n\r\n-\thttps://godoc.org/github.com/google/go-github/github\r\n-\thttps://github.com/google/go-github#readme\r\n\r\nAnd we keep them in sync (https://github.com/google/go-github/issues/397).\r\n\r\nPersonally, I always prefer looking at godoc, but I guess the idea is that beginners to Go may miss that, so putting it in the README helps them catch it.\r\n\r\nHowever, I like your idea of linking to the algorithm specification from the README to the godoc. That way, the specification is in one canonical place and cannot get out of sync.\r\n\r\nI'll apply that change."
      }
    },
    "public": true,
    "created_at": "2017-05-03T17:44:51Z"
  },
  {
    "id": "5803523880",
    "type": "IssuesEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 30574078,
      "name": "golang/tour",
      "url": "https://api.github.com/repos/golang/tour"
    },
    "payload": {
      "action": "closed",
      "issue": {
        "url": "https://api.github.com/repos/golang/tour/issues/146",
        "repository_url": "https://api.github.com/repos/golang/tour",
        "labels_url": "https://api.github.com/repos/golang/tour/issues/146/labels{/name}",
        "comments_url": "https://api.github.com/repos/golang/tour/issues/146/comments",
        "events_url": "https://api.github.com/repos/golang/tour/issues/146/events",
        "html_url": "https://github.com/golang/tour/issues/146",
        "id": 202004920,
        "number": 146,
        "title": "Update codemirror (editor) and enable some features",
        "user": {
          "login": "spf13",
          "id": 173412,
          "avatar_url": "https://avatars2.githubusercontent.com/u/173412?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/spf13",
          "html_url": "https://github.com/spf13",
          "followers_url": "https://api.github.com/users/spf13/followers",
          "following_url": "https://api.github.com/users/spf13/following{/other_user}",
          "gists_url": "https://api.github.com/users/spf13/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/spf13/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/spf13/subscriptions",
          "organizations_url": "https://api.github.com/users/spf13/orgs",
          "repos_url": "https://api.github.com/users/spf13/repos",
          "events_url": "https://api.github.com/users/spf13/events{/privacy}",
          "received_events_url": "https://api.github.com/users/spf13/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "closed",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 4,
        "created_at": "2017-01-19T23:21:54Z",
        "updated_at": "2017-05-03T17:36:36Z",
        "closed_at": "2017-05-03T17:36:36Z",
        "body": "Go tour already uses http://codemirror.net/. It could benefit from an update as the version used is out of date.\r\n\r\nIt would also be nice to enable features like bracket (paran) matching. \r\n\r\nAutocomplete support would be a very nice to have as would linting. codemirror supports both but not sure how hard the integration would be with go-code."
      }
    },
    "public": true,
    "created_at": "2017-05-03T17:36:36Z",
    "org": {
      "id": 4314092,
      "login": "golang",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/golang",
      "avatar_url": "https://avatars.githubusercontent.com/u/4314092?"
    }
  },
  {
    "id": "5803523865",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 30574078,
      "name": "golang/tour",
      "url": "https://api.github.com/repos/golang/tour"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/golang/tour/issues/146",
        "repository_url": "https://api.github.com/repos/golang/tour",
        "labels_url": "https://api.github.com/repos/golang/tour/issues/146/labels{/name}",
        "comments_url": "https://api.github.com/repos/golang/tour/issues/146/comments",
        "events_url": "https://api.github.com/repos/golang/tour/issues/146/events",
        "html_url": "https://github.com/golang/tour/issues/146",
        "id": 202004920,
        "number": 146,
        "title": "Update codemirror (editor) and enable some features",
        "user": {
          "login": "spf13",
          "id": 173412,
          "avatar_url": "https://avatars2.githubusercontent.com/u/173412?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/spf13",
          "html_url": "https://github.com/spf13",
          "followers_url": "https://api.github.com/users/spf13/followers",
          "following_url": "https://api.github.com/users/spf13/following{/other_user}",
          "gists_url": "https://api.github.com/users/spf13/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/spf13/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/spf13/subscriptions",
          "organizations_url": "https://api.github.com/users/spf13/orgs",
          "repos_url": "https://api.github.com/users/spf13/repos",
          "events_url": "https://api.github.com/users/spf13/events{/privacy}",
          "received_events_url": "https://api.github.com/users/spf13/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "closed",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 4,
        "created_at": "2017-01-19T23:21:54Z",
        "updated_at": "2017-05-03T17:36:36Z",
        "closed_at": "2017-05-03T17:36:36Z",
        "body": "Go tour already uses http://codemirror.net/. It could benefit from an update as the version used is out of date.\r\n\r\nIt would also be nice to enable features like bracket (paran) matching. \r\n\r\nAutocomplete support would be a very nice to have as would linting. codemirror supports both but not sure how hard the integration would be with go-code."
      },
      "comment": {
        "url": "https://api.github.com/repos/golang/tour/issues/comments/298981747",
        "html_url": "https://github.com/golang/tour/issues/146#issuecomment-298981747",
        "issue_url": "https://api.github.com/repos/golang/tour/issues/146",
        "id": 298981747,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-03T17:36:36Z",
        "updated_at": "2017-05-03T17:36:36Z",
        "body": "I see, thanks. That makes sense to me.\r\n\r\nTo keep the open issues here more actionable, I'll consider this issue resolved by [CL 41207](https://golang.org/cl/41207) (since the bracket matching/autocomplete were optional parts).\r\n\r\nIf there's more concrete information about additional features we want to turn on, with a good plan for how to ensure it doesn't detract from the Go tour experience, a new specific issue can be opened for that (or feel free to re-open this one)."
      }
    },
    "public": true,
    "created_at": "2017-05-03T17:36:36Z",
    "org": {
      "id": 4314092,
      "login": "golang",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/golang",
      "avatar_url": "https://avatars.githubusercontent.com/u/4314092?"
    }
  },
  {
    "id": "5803345814",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10151943,
      "name": "go-gl/glfw",
      "url": "https://api.github.com/repos/go-gl/glfw"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/go-gl/glfw/issues/195",
        "repository_url": "https://api.github.com/repos/go-gl/glfw",
        "labels_url": "https://api.github.com/repos/go-gl/glfw/issues/195/labels{/name}",
        "comments_url": "https://api.github.com/repos/go-gl/glfw/issues/195/comments",
        "events_url": "https://api.github.com/repos/go-gl/glfw/issues/195/events",
        "html_url": "https://github.com/go-gl/glfw/issues/195",
        "id": 226051064,
        "number": 195,
        "title": "glfw 3.3 beta support",
        "user": {
          "login": "mattkanwisher",
          "id": 3032,
          "avatar_url": "https://avatars3.githubusercontent.com/u/3032?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/mattkanwisher",
          "html_url": "https://github.com/mattkanwisher",
          "followers_url": "https://api.github.com/users/mattkanwisher/followers",
          "following_url": "https://api.github.com/users/mattkanwisher/following{/other_user}",
          "gists_url": "https://api.github.com/users/mattkanwisher/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/mattkanwisher/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/mattkanwisher/subscriptions",
          "organizations_url": "https://api.github.com/users/mattkanwisher/orgs",
          "repos_url": "https://api.github.com/users/mattkanwisher/repos",
          "events_url": "https://api.github.com/users/mattkanwisher/events{/privacy}",
          "received_events_url": "https://api.github.com/users/mattkanwisher/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 1,
        "created_at": "2017-05-03T16:58:01Z",
        "updated_at": "2017-05-03T17:11:08Z",
        "closed_at": null,
        "body": "I know there is not an official release but the master has a bunch of cocoa bugs that have been fixed in last 9 months. Would you be open to a PR that has a new folder that tracks master?"
      },
      "comment": {
        "url": "https://api.github.com/repos/go-gl/glfw/issues/comments/298975021",
        "html_url": "https://github.com/go-gl/glfw/issues/195#issuecomment-298975021",
        "issue_url": "https://api.github.com/repos/go-gl/glfw/issues/195",
        "id": 298975021,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-03T17:11:08Z",
        "updated_at": "2017-05-03T17:11:08Z",
        "body": "Sure, that'd be great. Feel free to make a PR that adds a ` + "`" + `v3.3/glfw` + "`" + ` package and uses latest ` + "`" + `master` + "`" + ` of GLFW (the C library).\r\n\r\nIf it looks good and is stable, we can consider annotating it as a work in progress pre-release and merging it earlier.\r\n\r\nWe'd have to do this when GLFW 3.3+ is released anyway, so this is taking an incremental step in that direction.\r\n\r\nDo you know if there are any API changes since 3.2.1?"
      }
    },
    "public": true,
    "created_at": "2017-05-03T17:11:08Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5802718005",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 12418999,
      "name": "gopherjs/gopherjs",
      "url": "https://api.github.com/repos/gopherjs/gopherjs"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/gopherjs/gopherjs/issues/639",
        "repository_url": "https://api.github.com/repos/gopherjs/gopherjs",
        "labels_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/639/labels{/name}",
        "comments_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/639/comments",
        "events_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/639/events",
        "html_url": "https://github.com/gopherjs/gopherjs/issues/639",
        "id": 225958573,
        "number": 639,
        "title": "Struct field assigned nil != nil",
        "user": {
          "login": "theclapp",
          "id": 2324697,
          "avatar_url": "https://avatars0.githubusercontent.com/u/2324697?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/theclapp",
          "html_url": "https://github.com/theclapp",
          "followers_url": "https://api.github.com/users/theclapp/followers",
          "following_url": "https://api.github.com/users/theclapp/following{/other_user}",
          "gists_url": "https://api.github.com/users/theclapp/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/theclapp/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/theclapp/subscriptions",
          "organizations_url": "https://api.github.com/users/theclapp/orgs",
          "repos_url": "https://api.github.com/users/theclapp/repos",
          "events_url": "https://api.github.com/users/theclapp/events{/privacy}",
          "received_events_url": "https://api.github.com/users/theclapp/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 0,
        "created_at": "2017-05-03T11:42:43Z",
        "updated_at": "2017-05-03T15:47:34Z",
        "closed_at": null,
        "body": "Why doesn't t1.foo == nil, after I just assigned it nil?  Why doesn't it even == itself?\r\n\r\n` + "```" + `go\r\ntype foo struct {\r\n\t*js.Object\r\n\tbar bool ` + "`" + `js:\"bar\"` + "`" + `\r\n}\r\ntype t struct {\r\n\t*js.Object\r\n\t*foo ` + "`" + `js:\"foo\"` + "`" + `\r\n}\r\n\r\nt1 := t{Object: js.Global.Get(\"Object\").New()}\r\nt1.foo = nil\r\n\r\n// => \"t1.foo != nil\"\r\nif t1.foo == nil {\r\n\tfmt.Println(\"t1.foo == nil\")\r\n} else {\r\n\tfmt.Println(\"t1.foo != nil\")\r\n}\r\nfmt.Printf(\"t1.foo is %v\\n\", t1.foo) // => \"t1.foo is null\"\r\n\r\n// => \"t1.foo != itself\"\r\nif t1.foo == t1.foo {\r\n\tfmt.Println(\"t1.foo == itself\")\r\n} else {\r\n\tfmt.Println(\"t1.foo != itself\")\r\n}\r\n` + "```" + `\r\n\r\n[Playground link](https://gopherjs.github.io/playground/#/ShksE-CYyc)\r\n\r\nAm I doing something wrong?  Is there a better way to deal with this?"
      },
      "comment": {
        "url": "https://api.github.com/repos/gopherjs/gopherjs/issues/comments/298952046",
        "html_url": "https://github.com/gopherjs/gopherjs/issues/639#issuecomment-298952046",
        "issue_url": "https://api.github.com/repos/gopherjs/gopherjs/issues/639",
        "id": 298952046,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-03T15:47:34Z",
        "updated_at": "2017-05-03T15:47:34Z",
        "body": "This definitely seems very messed up.\r\n\r\nHere's my attempt at doing better with dealing with it, but it's still not great.\r\n\r\nhttps://gopherjs.github.io/playground/#/k4XCYLcu0T\r\n\r\nI made ` + "`" + `foo` + "`" + ` not embedded in ` + "`" + `t` + "`" + `, compared ` + "`" + `foo.Object` + "`" + `s instead of ` + "`" + `foo` + "`" + `s, and used pointer to ` + "`" + `&t` + "`" + `.\r\n\r\nThis is why we have a proposal like #633 to clean up how these structs behave. /cc @myitcv"
      }
    },
    "public": true,
    "created_at": "2017-05-03T15:47:34Z",
    "org": {
      "id": 6654647,
      "login": "gopherjs",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/gopherjs",
      "avatar_url": "https://avatars.githubusercontent.com/u/6654647?"
    }
  },
  {
    "id": "5801505657",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 58911163,
      "name": "shurcooL/notificationsapp",
      "url": "https://api.github.com/repos/shurcooL/notificationsapp"
    },
    "payload": {
      "push_id": 1716870312,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "bb38167f25a9d4716fce8eaa039476b256ced07a",
      "before": "eaaea8af7dd0b3692204814f59dbee767dd7499e",
      "commits": [
        {
          "sha": "bb38167f25a9d4716fce8eaa039476b256ced07a",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "assets/_data/script: Use new notifications API client, auth via header.\n\nAuthentication is outsourced to a custom http.RoundTripper\nthat sets the Authorization header to a bearer access token.\nThis is consistent with how authentication is usually done on backend.\nFor example, see https://godoc.org/github.com/google/go-github/github#hdr-Authentication.\nAlso use golang.org/x/oauth2 package as the implementation of custom\nhttp.RoundTripper.\n\nNow, authentication is done identically on frontend and backend.\n\nFetch the access token from the access token cookie that should be\navailable for authenticated users.\n\nRegenerate.\n\nSimilar to shurcooL/resume@a41256353ba40297bab6bb68be30c8b6980ece58.\n\nFollows eaaea8af7dd0b3692204814f59dbee767dd7499e\nand shurcooL/home@14dde29aacedb8a8c3d8dd6732e147cdad1ae4a8.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/notificationsapp/commits/bb38167f25a9d4716fce8eaa039476b256ced07a"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-03T13:21:20Z"
  },
  {
    "id": "5801500973",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 21540759,
      "name": "avelino/awesome-go",
      "url": "https://api.github.com/repos/avelino/awesome-go"
    },
    "payload": {
      "push_id": 1716868755,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "bd21d06703d855729c23bb847e5a873649775fd4",
      "before": "94aeb5753ae6c04b8f6a539dfab455a3f2204ec3",
      "commits": [
        {
          "sha": "bd21d06703d855729c23bb847e5a873649775fd4",
          "author": {
            "email": "jboursiquot@gmail.com",
            "name": "Johnny Boursiquot"
          },
          "message": "Add Capital Go conference. (#1402)\n\nA Go conference in Washington, D.C., USA. Next one is on April 24-25.",
          "distinct": true,
          "url": "https://api.github.com/repos/avelino/awesome-go/commits/bd21d06703d855729c23bb847e5a873649775fd4"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-03T13:20:42Z"
  },
  {
    "id": "5801498239",
    "type": "PullRequestEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 21540759,
      "name": "avelino/awesome-go",
      "url": "https://api.github.com/repos/avelino/awesome-go"
    },
    "payload": {
      "action": "closed",
      "number": 1402,
      "pull_request": {
        "url": "https://api.github.com/repos/avelino/awesome-go/pulls/1402",
        "id": 118627417,
        "html_url": "https://github.com/avelino/awesome-go/pull/1402",
        "diff_url": "https://github.com/avelino/awesome-go/pull/1402.diff",
        "patch_url": "https://github.com/avelino/awesome-go/pull/1402.patch",
        "issue_url": "https://api.github.com/repos/avelino/awesome-go/issues/1402",
        "number": 1402,
        "state": "closed",
        "locked": false,
        "title": "Add Capital Go conference",
        "user": {
          "login": "jboursiquot",
          "id": 255053,
          "avatar_url": "https://avatars1.githubusercontent.com/u/255053?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/jboursiquot",
          "html_url": "https://github.com/jboursiquot",
          "followers_url": "https://api.github.com/users/jboursiquot/followers",
          "following_url": "https://api.github.com/users/jboursiquot/following{/other_user}",
          "gists_url": "https://api.github.com/users/jboursiquot/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/jboursiquot/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/jboursiquot/subscriptions",
          "organizations_url": "https://api.github.com/users/jboursiquot/orgs",
          "repos_url": "https://api.github.com/users/jboursiquot/repos",
          "events_url": "https://api.github.com/users/jboursiquot/events{/privacy}",
          "received_events_url": "https://api.github.com/users/jboursiquot/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "Please check if what you want to add to ` + "`" + `awesome-go` + "`" + ` list meets [quality standards](https://github.com/avelino/awesome-go/blob/master/CONTRIBUTING.md#quality-standard) before sending pull request. Thanks!\r\n\r\n**Please provide package links to:**\r\n\r\n- github.com repo:\r\n- godoc.org:\r\n- goreportcard.com:\r\n- coverage service link ([cover.run](https://cover.run/), [gocover](http://gocover.io/), [coveralls](https://coveralls.io/) etc.), example: ` + "`" + `![cover.run go](https://cover.run/go/github.com/user/repository.svg)` + "`" + `\r\n\r\nVery good coverage\r\n\r\n**Note**: that new categories can be added only when there are 3 packages or more.\r\n\r\n**Make sure that you've checked the boxes below before you submit PR:**\r\n- [NA] I have added my package in alphabetical order\r\n- [NA] I know that this package was not listed before\r\n- [NA] I have added godoc link to the repo and to my pull request\r\n- [NA] I have added coverage service link to the repo and to my pull request\r\n- [NA] I have added goreportcard link to the repo and to my pull request\r\n- [x] I have read [Contribution guidelines](https://github.com/avelino/awesome-go/blob/master/CONTRIBUTING.md#contribution-guidelines) and [Quality standard](https://github.com/avelino/awesome-go/blob/master/CONTRIBUTING.md#quality-standard).\r\n\r\nThanks for your PR, you're awesome! :+1:\r\n",
        "created_at": "2017-05-02T19:23:57Z",
        "updated_at": "2017-05-03T13:20:18Z",
        "closed_at": "2017-05-03T13:20:18Z",
        "merged_at": "2017-05-03T13:20:18Z",
        "merge_commit_sha": "bd21d06703d855729c23bb847e5a873649775fd4",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/avelino/awesome-go/pulls/1402/commits",
        "review_comments_url": "https://api.github.com/repos/avelino/awesome-go/pulls/1402/comments",
        "review_comment_url": "https://api.github.com/repos/avelino/awesome-go/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/avelino/awesome-go/issues/1402/comments",
        "statuses_url": "https://api.github.com/repos/avelino/awesome-go/statuses/db302924647c8e4159d60a4c4aa4fdc39377c391",
        "head": {
          "label": "jboursiquot:patch-1",
          "ref": "patch-1",
          "sha": "db302924647c8e4159d60a4c4aa4fdc39377c391",
          "user": {
            "login": "jboursiquot",
            "id": 255053,
            "avatar_url": "https://avatars1.githubusercontent.com/u/255053?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/jboursiquot",
            "html_url": "https://github.com/jboursiquot",
            "followers_url": "https://api.github.com/users/jboursiquot/followers",
            "following_url": "https://api.github.com/users/jboursiquot/following{/other_user}",
            "gists_url": "https://api.github.com/users/jboursiquot/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/jboursiquot/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/jboursiquot/subscriptions",
            "organizations_url": "https://api.github.com/users/jboursiquot/orgs",
            "repos_url": "https://api.github.com/users/jboursiquot/repos",
            "events_url": "https://api.github.com/users/jboursiquot/events{/privacy}",
            "received_events_url": "https://api.github.com/users/jboursiquot/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 90069287,
            "name": "awesome-go",
            "full_name": "jboursiquot/awesome-go",
            "owner": {
              "login": "jboursiquot",
              "id": 255053,
              "avatar_url": "https://avatars1.githubusercontent.com/u/255053?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/jboursiquot",
              "html_url": "https://github.com/jboursiquot",
              "followers_url": "https://api.github.com/users/jboursiquot/followers",
              "following_url": "https://api.github.com/users/jboursiquot/following{/other_user}",
              "gists_url": "https://api.github.com/users/jboursiquot/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/jboursiquot/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/jboursiquot/subscriptions",
              "organizations_url": "https://api.github.com/users/jboursiquot/orgs",
              "repos_url": "https://api.github.com/users/jboursiquot/repos",
              "events_url": "https://api.github.com/users/jboursiquot/events{/privacy}",
              "received_events_url": "https://api.github.com/users/jboursiquot/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/jboursiquot/awesome-go",
            "description": "A curated list of awesome Go frameworks, libraries and software",
            "fork": true,
            "url": "https://api.github.com/repos/jboursiquot/awesome-go",
            "forks_url": "https://api.github.com/repos/jboursiquot/awesome-go/forks",
            "keys_url": "https://api.github.com/repos/jboursiquot/awesome-go/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/jboursiquot/awesome-go/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/jboursiquot/awesome-go/teams",
            "hooks_url": "https://api.github.com/repos/jboursiquot/awesome-go/hooks",
            "issue_events_url": "https://api.github.com/repos/jboursiquot/awesome-go/issues/events{/number}",
            "events_url": "https://api.github.com/repos/jboursiquot/awesome-go/events",
            "assignees_url": "https://api.github.com/repos/jboursiquot/awesome-go/assignees{/user}",
            "branches_url": "https://api.github.com/repos/jboursiquot/awesome-go/branches{/branch}",
            "tags_url": "https://api.github.com/repos/jboursiquot/awesome-go/tags",
            "blobs_url": "https://api.github.com/repos/jboursiquot/awesome-go/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/jboursiquot/awesome-go/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/jboursiquot/awesome-go/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/jboursiquot/awesome-go/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/jboursiquot/awesome-go/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/jboursiquot/awesome-go/languages",
            "stargazers_url": "https://api.github.com/repos/jboursiquot/awesome-go/stargazers",
            "contributors_url": "https://api.github.com/repos/jboursiquot/awesome-go/contributors",
            "subscribers_url": "https://api.github.com/repos/jboursiquot/awesome-go/subscribers",
            "subscription_url": "https://api.github.com/repos/jboursiquot/awesome-go/subscription",
            "commits_url": "https://api.github.com/repos/jboursiquot/awesome-go/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/jboursiquot/awesome-go/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/jboursiquot/awesome-go/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/jboursiquot/awesome-go/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/jboursiquot/awesome-go/contents/{+path}",
            "compare_url": "https://api.github.com/repos/jboursiquot/awesome-go/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/jboursiquot/awesome-go/merges",
            "archive_url": "https://api.github.com/repos/jboursiquot/awesome-go/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/jboursiquot/awesome-go/downloads",
            "issues_url": "https://api.github.com/repos/jboursiquot/awesome-go/issues{/number}",
            "pulls_url": "https://api.github.com/repos/jboursiquot/awesome-go/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/jboursiquot/awesome-go/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/jboursiquot/awesome-go/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/jboursiquot/awesome-go/labels{/name}",
            "releases_url": "https://api.github.com/repos/jboursiquot/awesome-go/releases{/id}",
            "deployments_url": "https://api.github.com/repos/jboursiquot/awesome-go/deployments",
            "created_at": "2017-05-02T19:17:36Z",
            "updated_at": "2017-05-02T19:17:39Z",
            "pushed_at": "2017-05-03T13:13:23Z",
            "git_url": "git://github.com/jboursiquot/awesome-go.git",
            "ssh_url": "git@github.com:jboursiquot/awesome-go.git",
            "clone_url": "https://github.com/jboursiquot/awesome-go.git",
            "svn_url": "https://github.com/jboursiquot/awesome-go",
            "homepage": "http://awesome-go.com/",
            "size": 3881,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "Go",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "avelino:master",
          "ref": "master",
          "sha": "94aeb5753ae6c04b8f6a539dfab455a3f2204ec3",
          "user": {
            "login": "avelino",
            "id": 31996,
            "avatar_url": "https://avatars1.githubusercontent.com/u/31996?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/avelino",
            "html_url": "https://github.com/avelino",
            "followers_url": "https://api.github.com/users/avelino/followers",
            "following_url": "https://api.github.com/users/avelino/following{/other_user}",
            "gists_url": "https://api.github.com/users/avelino/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/avelino/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/avelino/subscriptions",
            "organizations_url": "https://api.github.com/users/avelino/orgs",
            "repos_url": "https://api.github.com/users/avelino/repos",
            "events_url": "https://api.github.com/users/avelino/events{/privacy}",
            "received_events_url": "https://api.github.com/users/avelino/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 21540759,
            "name": "awesome-go",
            "full_name": "avelino/awesome-go",
            "owner": {
              "login": "avelino",
              "id": 31996,
              "avatar_url": "https://avatars1.githubusercontent.com/u/31996?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/avelino",
              "html_url": "https://github.com/avelino",
              "followers_url": "https://api.github.com/users/avelino/followers",
              "following_url": "https://api.github.com/users/avelino/following{/other_user}",
              "gists_url": "https://api.github.com/users/avelino/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/avelino/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/avelino/subscriptions",
              "organizations_url": "https://api.github.com/users/avelino/orgs",
              "repos_url": "https://api.github.com/users/avelino/repos",
              "events_url": "https://api.github.com/users/avelino/events{/privacy}",
              "received_events_url": "https://api.github.com/users/avelino/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/avelino/awesome-go",
            "description": "A curated list of awesome Go frameworks, libraries and software",
            "fork": false,
            "url": "https://api.github.com/repos/avelino/awesome-go",
            "forks_url": "https://api.github.com/repos/avelino/awesome-go/forks",
            "keys_url": "https://api.github.com/repos/avelino/awesome-go/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/avelino/awesome-go/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/avelino/awesome-go/teams",
            "hooks_url": "https://api.github.com/repos/avelino/awesome-go/hooks",
            "issue_events_url": "https://api.github.com/repos/avelino/awesome-go/issues/events{/number}",
            "events_url": "https://api.github.com/repos/avelino/awesome-go/events",
            "assignees_url": "https://api.github.com/repos/avelino/awesome-go/assignees{/user}",
            "branches_url": "https://api.github.com/repos/avelino/awesome-go/branches{/branch}",
            "tags_url": "https://api.github.com/repos/avelino/awesome-go/tags",
            "blobs_url": "https://api.github.com/repos/avelino/awesome-go/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/avelino/awesome-go/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/avelino/awesome-go/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/avelino/awesome-go/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/avelino/awesome-go/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/avelino/awesome-go/languages",
            "stargazers_url": "https://api.github.com/repos/avelino/awesome-go/stargazers",
            "contributors_url": "https://api.github.com/repos/avelino/awesome-go/contributors",
            "subscribers_url": "https://api.github.com/repos/avelino/awesome-go/subscribers",
            "subscription_url": "https://api.github.com/repos/avelino/awesome-go/subscription",
            "commits_url": "https://api.github.com/repos/avelino/awesome-go/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/avelino/awesome-go/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/avelino/awesome-go/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/avelino/awesome-go/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/avelino/awesome-go/contents/{+path}",
            "compare_url": "https://api.github.com/repos/avelino/awesome-go/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/avelino/awesome-go/merges",
            "archive_url": "https://api.github.com/repos/avelino/awesome-go/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/avelino/awesome-go/downloads",
            "issues_url": "https://api.github.com/repos/avelino/awesome-go/issues{/number}",
            "pulls_url": "https://api.github.com/repos/avelino/awesome-go/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/avelino/awesome-go/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/avelino/awesome-go/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/avelino/awesome-go/labels{/name}",
            "releases_url": "https://api.github.com/repos/avelino/awesome-go/releases{/id}",
            "deployments_url": "https://api.github.com/repos/avelino/awesome-go/deployments",
            "created_at": "2014-07-06T13:42:15Z",
            "updated_at": "2017-05-03T13:13:05Z",
            "pushed_at": "2017-05-03T13:20:18Z",
            "git_url": "git://github.com/avelino/awesome-go.git",
            "ssh_url": "git@github.com:avelino/awesome-go.git",
            "clone_url": "https://github.com/avelino/awesome-go.git",
            "svn_url": "https://github.com/avelino/awesome-go",
            "homepage": "http://awesome-go.com/",
            "size": 3882,
            "stargazers_count": 20205,
            "watchers_count": 20205,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": true,
            "forks_count": 2529,
            "mirror_url": null,
            "open_issues_count": 173,
            "forks": 2529,
            "open_issues": 173,
            "watchers": 20205,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/avelino/awesome-go/pulls/1402"
          },
          "html": {
            "href": "https://github.com/avelino/awesome-go/pull/1402"
          },
          "issue": {
            "href": "https://api.github.com/repos/avelino/awesome-go/issues/1402"
          },
          "comments": {
            "href": "https://api.github.com/repos/avelino/awesome-go/issues/1402/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/avelino/awesome-go/pulls/1402/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/avelino/awesome-go/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/avelino/awesome-go/pulls/1402/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/avelino/awesome-go/statuses/db302924647c8e4159d60a4c4aa4fdc39377c391"
          }
        },
        "merged": true,
        "mergeable": null,
        "rebaseable": null,
        "mergeable_state": "unknown",
        "merged_by": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "comments": 0,
        "review_comments": 2,
        "maintainer_can_modify": false,
        "commits": 2,
        "additions": 1,
        "deletions": 0,
        "changed_files": 1
      }
    },
    "public": true,
    "created_at": "2017-05-03T13:20:20Z"
  },
  {
    "id": "5801231130",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 70479183,
      "name": "bradleyfalzon/gopherci",
      "url": "https://api.github.com/repos/bradleyfalzon/gopherci"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/bradleyfalzon/gopherci/issues/91",
        "repository_url": "https://api.github.com/repos/bradleyfalzon/gopherci",
        "labels_url": "https://api.github.com/repos/bradleyfalzon/gopherci/issues/91/labels{/name}",
        "comments_url": "https://api.github.com/repos/bradleyfalzon/gopherci/issues/91/comments",
        "events_url": "https://api.github.com/repos/bradleyfalzon/gopherci/issues/91/events",
        "html_url": "https://github.com/bradleyfalzon/gopherci/issues/91",
        "id": 225234260,
        "number": 91,
        "title": "GopherCI fails with an Internal error when there's missing cgo dependencies",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 458524465,
            "url": "https://api.github.com/repos/bradleyfalzon/gopherci/labels/bug",
            "name": "bug",
            "color": "ee0701",
            "default": true
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": {
          "login": "bradleyfalzon",
          "id": 1834577,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1834577?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/bradleyfalzon",
          "html_url": "https://github.com/bradleyfalzon",
          "followers_url": "https://api.github.com/users/bradleyfalzon/followers",
          "following_url": "https://api.github.com/users/bradleyfalzon/following{/other_user}",
          "gists_url": "https://api.github.com/users/bradleyfalzon/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/bradleyfalzon/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/bradleyfalzon/subscriptions",
          "organizations_url": "https://api.github.com/users/bradleyfalzon/orgs",
          "repos_url": "https://api.github.com/users/bradleyfalzon/repos",
          "events_url": "https://api.github.com/users/bradleyfalzon/events{/privacy}",
          "received_events_url": "https://api.github.com/users/bradleyfalzon/received_events",
          "type": "User",
          "site_admin": false
        },
        "assignees": [
          {
            "login": "bradleyfalzon",
            "id": 1834577,
            "avatar_url": "https://avatars0.githubusercontent.com/u/1834577?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/bradleyfalzon",
            "html_url": "https://github.com/bradleyfalzon",
            "followers_url": "https://api.github.com/users/bradleyfalzon/followers",
            "following_url": "https://api.github.com/users/bradleyfalzon/following{/other_user}",
            "gists_url": "https://api.github.com/users/bradleyfalzon/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/bradleyfalzon/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/bradleyfalzon/subscriptions",
            "organizations_url": "https://api.github.com/users/bradleyfalzon/orgs",
            "repos_url": "https://api.github.com/users/bradleyfalzon/repos",
            "events_url": "https://api.github.com/users/bradleyfalzon/events{/privacy}",
            "received_events_url": "https://api.github.com/users/bradleyfalzon/received_events",
            "type": "User",
            "site_admin": false
          }
        ],
        "milestone": null,
        "comments": 3,
        "created_at": "2017-04-29T05:12:02Z",
        "updated_at": "2017-05-03T12:41:16Z",
        "closed_at": null,
        "body": "I did a ` + "`" + `git push` + "`" + ` with 3 new commits to ` + "`" + `master` + "`" + ` of https://github.com/shurcooL/cmd:\r\n\r\n![image](https://cloud.githubusercontent.com/assets/1924134/25553088/97dc9266-2c78-11e7-8cba-c66b6165b17f.png)\r\n\r\nAnd got a 500 from GopherCI:\r\n\r\n![image](https://cloud.githubusercontent.com/assets/1924134/25553094/b8a36d94-2c78-11e7-96a8-1a6c94eac48b.png)\r\n\r\nThe description is \"Could not get VCS\".\r\n\r\nhttps://gci.gopherci.io/analysis/319\r\n\r\nReporting this in case it's helpful. Feel free to close otherwise."
      },
      "comment": {
        "url": "https://api.github.com/repos/bradleyfalzon/gopherci/issues/comments/298899239",
        "html_url": "https://github.com/bradleyfalzon/gopherci/issues/91#issuecomment-298899239",
        "issue_url": "https://api.github.com/repos/bradleyfalzon/gopherci/issues/91",
        "id": 298899239,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-03T12:41:16Z",
        "updated_at": "2017-05-03T12:41:16Z",
        "body": "No time pressure from my side. Thanks."
      }
    },
    "public": true,
    "created_at": "2017-05-03T12:41:16Z"
  },
  {
    "id": "5798885654",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 21540759,
      "name": "avelino/awesome-go",
      "url": "https://api.github.com/repos/avelino/awesome-go"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/avelino/awesome-go/pulls/comments/114470315",
        "pull_request_review_id": 35937710,
        "id": 114470315,
        "diff_hunk": "@@ -1489,6 +1489,7 @@ Where to discover new Go libraries.\n \n ## Conferences\n \n+* [Capital Go](http://www.capitalgolang.com) - Washington DC, USA",
        "path": "README.md",
        "position": 4,
        "original_position": 4,
        "commit_id": "242cb84464cfbf7fc228984a4eb7696ba0683ac7",
        "original_commit_id": "242cb84464cfbf7fc228984a4eb7696ba0683ac7",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "Minor, but shouldn't this be \"Washington, D.C., USA\"?\r\n\r\nThat's what it says at http://www.capitalgolang.com, and <https://en.wikipedia.org/wiki/Washington,_D.C.>.",
        "created_at": "2017-05-03T04:19:32Z",
        "updated_at": "2017-05-03T04:20:05Z",
        "html_url": "https://github.com/avelino/awesome-go/pull/1402#discussion_r114470315",
        "pull_request_url": "https://api.github.com/repos/avelino/awesome-go/pulls/1402",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/avelino/awesome-go/pulls/comments/114470315"
          },
          "html": {
            "href": "https://github.com/avelino/awesome-go/pull/1402#discussion_r114470315"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/avelino/awesome-go/pulls/1402"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/avelino/awesome-go/pulls/1402",
        "id": 118627417,
        "html_url": "https://github.com/avelino/awesome-go/pull/1402",
        "diff_url": "https://github.com/avelino/awesome-go/pull/1402.diff",
        "patch_url": "https://github.com/avelino/awesome-go/pull/1402.patch",
        "issue_url": "https://api.github.com/repos/avelino/awesome-go/issues/1402",
        "number": 1402,
        "state": "open",
        "locked": false,
        "title": "Add Capital Go conference",
        "user": {
          "login": "jboursiquot",
          "id": 255053,
          "avatar_url": "https://avatars1.githubusercontent.com/u/255053?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/jboursiquot",
          "html_url": "https://github.com/jboursiquot",
          "followers_url": "https://api.github.com/users/jboursiquot/followers",
          "following_url": "https://api.github.com/users/jboursiquot/following{/other_user}",
          "gists_url": "https://api.github.com/users/jboursiquot/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/jboursiquot/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/jboursiquot/subscriptions",
          "organizations_url": "https://api.github.com/users/jboursiquot/orgs",
          "repos_url": "https://api.github.com/users/jboursiquot/repos",
          "events_url": "https://api.github.com/users/jboursiquot/events{/privacy}",
          "received_events_url": "https://api.github.com/users/jboursiquot/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "Please check if what you want to add to ` + "`" + `awesome-go` + "`" + ` list meets [quality standards](https://github.com/avelino/awesome-go/blob/master/CONTRIBUTING.md#quality-standard) before sending pull request. Thanks!\r\n\r\n**Please provide package links to:**\r\n\r\n- github.com repo:\r\n- godoc.org:\r\n- goreportcard.com:\r\n- coverage service link ([cover.run](https://cover.run/), [gocover](http://gocover.io/), [coveralls](https://coveralls.io/) etc.), example: ` + "`" + `![cover.run go](https://cover.run/go/github.com/user/repository.svg)` + "`" + `\r\n\r\nVery good coverage\r\n\r\n**Note**: that new categories can be added only when there are 3 packages or more.\r\n\r\n**Make sure that you've checked the boxes below before you submit PR:**\r\n- [NA] I have added my package in alphabetical order\r\n- [NA] I know that this package was not listed before\r\n- [NA] I have added godoc link to the repo and to my pull request\r\n- [NA] I have added coverage service link to the repo and to my pull request\r\n- [NA] I have added goreportcard link to the repo and to my pull request\r\n- [x] I have read [Contribution guidelines](https://github.com/avelino/awesome-go/blob/master/CONTRIBUTING.md#contribution-guidelines) and [Quality standard](https://github.com/avelino/awesome-go/blob/master/CONTRIBUTING.md#quality-standard).\r\n\r\nThanks for your PR, you're awesome! :+1:\r\n",
        "created_at": "2017-05-02T19:23:57Z",
        "updated_at": "2017-05-03T04:20:05Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "2e5c1c2786d3a6d6d0bbbed713eafda8f72c5bba",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/avelino/awesome-go/pulls/1402/commits",
        "review_comments_url": "https://api.github.com/repos/avelino/awesome-go/pulls/1402/comments",
        "review_comment_url": "https://api.github.com/repos/avelino/awesome-go/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/avelino/awesome-go/issues/1402/comments",
        "statuses_url": "https://api.github.com/repos/avelino/awesome-go/statuses/242cb84464cfbf7fc228984a4eb7696ba0683ac7",
        "head": {
          "label": "jboursiquot:patch-1",
          "ref": "patch-1",
          "sha": "242cb84464cfbf7fc228984a4eb7696ba0683ac7",
          "user": {
            "login": "jboursiquot",
            "id": 255053,
            "avatar_url": "https://avatars1.githubusercontent.com/u/255053?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/jboursiquot",
            "html_url": "https://github.com/jboursiquot",
            "followers_url": "https://api.github.com/users/jboursiquot/followers",
            "following_url": "https://api.github.com/users/jboursiquot/following{/other_user}",
            "gists_url": "https://api.github.com/users/jboursiquot/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/jboursiquot/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/jboursiquot/subscriptions",
            "organizations_url": "https://api.github.com/users/jboursiquot/orgs",
            "repos_url": "https://api.github.com/users/jboursiquot/repos",
            "events_url": "https://api.github.com/users/jboursiquot/events{/privacy}",
            "received_events_url": "https://api.github.com/users/jboursiquot/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 90069287,
            "name": "awesome-go",
            "full_name": "jboursiquot/awesome-go",
            "owner": {
              "login": "jboursiquot",
              "id": 255053,
              "avatar_url": "https://avatars1.githubusercontent.com/u/255053?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/jboursiquot",
              "html_url": "https://github.com/jboursiquot",
              "followers_url": "https://api.github.com/users/jboursiquot/followers",
              "following_url": "https://api.github.com/users/jboursiquot/following{/other_user}",
              "gists_url": "https://api.github.com/users/jboursiquot/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/jboursiquot/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/jboursiquot/subscriptions",
              "organizations_url": "https://api.github.com/users/jboursiquot/orgs",
              "repos_url": "https://api.github.com/users/jboursiquot/repos",
              "events_url": "https://api.github.com/users/jboursiquot/events{/privacy}",
              "received_events_url": "https://api.github.com/users/jboursiquot/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/jboursiquot/awesome-go",
            "description": "A curated list of awesome Go frameworks, libraries and software",
            "fork": true,
            "url": "https://api.github.com/repos/jboursiquot/awesome-go",
            "forks_url": "https://api.github.com/repos/jboursiquot/awesome-go/forks",
            "keys_url": "https://api.github.com/repos/jboursiquot/awesome-go/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/jboursiquot/awesome-go/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/jboursiquot/awesome-go/teams",
            "hooks_url": "https://api.github.com/repos/jboursiquot/awesome-go/hooks",
            "issue_events_url": "https://api.github.com/repos/jboursiquot/awesome-go/issues/events{/number}",
            "events_url": "https://api.github.com/repos/jboursiquot/awesome-go/events",
            "assignees_url": "https://api.github.com/repos/jboursiquot/awesome-go/assignees{/user}",
            "branches_url": "https://api.github.com/repos/jboursiquot/awesome-go/branches{/branch}",
            "tags_url": "https://api.github.com/repos/jboursiquot/awesome-go/tags",
            "blobs_url": "https://api.github.com/repos/jboursiquot/awesome-go/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/jboursiquot/awesome-go/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/jboursiquot/awesome-go/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/jboursiquot/awesome-go/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/jboursiquot/awesome-go/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/jboursiquot/awesome-go/languages",
            "stargazers_url": "https://api.github.com/repos/jboursiquot/awesome-go/stargazers",
            "contributors_url": "https://api.github.com/repos/jboursiquot/awesome-go/contributors",
            "subscribers_url": "https://api.github.com/repos/jboursiquot/awesome-go/subscribers",
            "subscription_url": "https://api.github.com/repos/jboursiquot/awesome-go/subscription",
            "commits_url": "https://api.github.com/repos/jboursiquot/awesome-go/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/jboursiquot/awesome-go/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/jboursiquot/awesome-go/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/jboursiquot/awesome-go/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/jboursiquot/awesome-go/contents/{+path}",
            "compare_url": "https://api.github.com/repos/jboursiquot/awesome-go/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/jboursiquot/awesome-go/merges",
            "archive_url": "https://api.github.com/repos/jboursiquot/awesome-go/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/jboursiquot/awesome-go/downloads",
            "issues_url": "https://api.github.com/repos/jboursiquot/awesome-go/issues{/number}",
            "pulls_url": "https://api.github.com/repos/jboursiquot/awesome-go/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/jboursiquot/awesome-go/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/jboursiquot/awesome-go/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/jboursiquot/awesome-go/labels{/name}",
            "releases_url": "https://api.github.com/repos/jboursiquot/awesome-go/releases{/id}",
            "deployments_url": "https://api.github.com/repos/jboursiquot/awesome-go/deployments",
            "created_at": "2017-05-02T19:17:36Z",
            "updated_at": "2017-05-02T19:17:39Z",
            "pushed_at": "2017-05-02T19:21:15Z",
            "git_url": "git://github.com/jboursiquot/awesome-go.git",
            "ssh_url": "git@github.com:jboursiquot/awesome-go.git",
            "clone_url": "https://github.com/jboursiquot/awesome-go.git",
            "svn_url": "https://github.com/jboursiquot/awesome-go",
            "homepage": "http://awesome-go.com/",
            "size": 3881,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "Go",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "avelino:master",
          "ref": "master",
          "sha": "94aeb5753ae6c04b8f6a539dfab455a3f2204ec3",
          "user": {
            "login": "avelino",
            "id": 31996,
            "avatar_url": "https://avatars1.githubusercontent.com/u/31996?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/avelino",
            "html_url": "https://github.com/avelino",
            "followers_url": "https://api.github.com/users/avelino/followers",
            "following_url": "https://api.github.com/users/avelino/following{/other_user}",
            "gists_url": "https://api.github.com/users/avelino/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/avelino/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/avelino/subscriptions",
            "organizations_url": "https://api.github.com/users/avelino/orgs",
            "repos_url": "https://api.github.com/users/avelino/repos",
            "events_url": "https://api.github.com/users/avelino/events{/privacy}",
            "received_events_url": "https://api.github.com/users/avelino/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 21540759,
            "name": "awesome-go",
            "full_name": "avelino/awesome-go",
            "owner": {
              "login": "avelino",
              "id": 31996,
              "avatar_url": "https://avatars1.githubusercontent.com/u/31996?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/avelino",
              "html_url": "https://github.com/avelino",
              "followers_url": "https://api.github.com/users/avelino/followers",
              "following_url": "https://api.github.com/users/avelino/following{/other_user}",
              "gists_url": "https://api.github.com/users/avelino/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/avelino/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/avelino/subscriptions",
              "organizations_url": "https://api.github.com/users/avelino/orgs",
              "repos_url": "https://api.github.com/users/avelino/repos",
              "events_url": "https://api.github.com/users/avelino/events{/privacy}",
              "received_events_url": "https://api.github.com/users/avelino/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/avelino/awesome-go",
            "description": "A curated list of awesome Go frameworks, libraries and software",
            "fork": false,
            "url": "https://api.github.com/repos/avelino/awesome-go",
            "forks_url": "https://api.github.com/repos/avelino/awesome-go/forks",
            "keys_url": "https://api.github.com/repos/avelino/awesome-go/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/avelino/awesome-go/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/avelino/awesome-go/teams",
            "hooks_url": "https://api.github.com/repos/avelino/awesome-go/hooks",
            "issue_events_url": "https://api.github.com/repos/avelino/awesome-go/issues/events{/number}",
            "events_url": "https://api.github.com/repos/avelino/awesome-go/events",
            "assignees_url": "https://api.github.com/repos/avelino/awesome-go/assignees{/user}",
            "branches_url": "https://api.github.com/repos/avelino/awesome-go/branches{/branch}",
            "tags_url": "https://api.github.com/repos/avelino/awesome-go/tags",
            "blobs_url": "https://api.github.com/repos/avelino/awesome-go/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/avelino/awesome-go/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/avelino/awesome-go/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/avelino/awesome-go/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/avelino/awesome-go/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/avelino/awesome-go/languages",
            "stargazers_url": "https://api.github.com/repos/avelino/awesome-go/stargazers",
            "contributors_url": "https://api.github.com/repos/avelino/awesome-go/contributors",
            "subscribers_url": "https://api.github.com/repos/avelino/awesome-go/subscribers",
            "subscription_url": "https://api.github.com/repos/avelino/awesome-go/subscription",
            "commits_url": "https://api.github.com/repos/avelino/awesome-go/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/avelino/awesome-go/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/avelino/awesome-go/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/avelino/awesome-go/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/avelino/awesome-go/contents/{+path}",
            "compare_url": "https://api.github.com/repos/avelino/awesome-go/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/avelino/awesome-go/merges",
            "archive_url": "https://api.github.com/repos/avelino/awesome-go/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/avelino/awesome-go/downloads",
            "issues_url": "https://api.github.com/repos/avelino/awesome-go/issues{/number}",
            "pulls_url": "https://api.github.com/repos/avelino/awesome-go/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/avelino/awesome-go/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/avelino/awesome-go/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/avelino/awesome-go/labels{/name}",
            "releases_url": "https://api.github.com/repos/avelino/awesome-go/releases{/id}",
            "deployments_url": "https://api.github.com/repos/avelino/awesome-go/deployments",
            "created_at": "2014-07-06T13:42:15Z",
            "updated_at": "2017-05-03T04:04:09Z",
            "pushed_at": "2017-05-02T19:23:58Z",
            "git_url": "git://github.com/avelino/awesome-go.git",
            "ssh_url": "git@github.com:avelino/awesome-go.git",
            "clone_url": "https://github.com/avelino/awesome-go.git",
            "svn_url": "https://github.com/avelino/awesome-go",
            "homepage": "http://awesome-go.com/",
            "size": 3882,
            "stargazers_count": 20195,
            "watchers_count": 20195,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": true,
            "forks_count": 2528,
            "mirror_url": null,
            "open_issues_count": 174,
            "forks": 2528,
            "open_issues": 174,
            "watchers": 20195,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/avelino/awesome-go/pulls/1402"
          },
          "html": {
            "href": "https://github.com/avelino/awesome-go/pull/1402"
          },
          "issue": {
            "href": "https://api.github.com/repos/avelino/awesome-go/issues/1402"
          },
          "comments": {
            "href": "https://api.github.com/repos/avelino/awesome-go/issues/1402/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/avelino/awesome-go/pulls/1402/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/avelino/awesome-go/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/avelino/awesome-go/pulls/1402/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/avelino/awesome-go/statuses/242cb84464cfbf7fc228984a4eb7696ba0683ac7"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-03T04:19:32Z"
  },
  {
    "id": "5798878824",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 10835647,
      "name": "mattn/go-runewidth",
      "url": "https://api.github.com/repos/mattn/go-runewidth"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/mattn/go-runewidth/issues/12",
        "repository_url": "https://api.github.com/repos/mattn/go-runewidth",
        "labels_url": "https://api.github.com/repos/mattn/go-runewidth/issues/12/labels{/name}",
        "comments_url": "https://api.github.com/repos/mattn/go-runewidth/issues/12/comments",
        "events_url": "https://api.github.com/repos/mattn/go-runewidth/issues/12/events",
        "html_url": "https://github.com/mattn/go-runewidth/issues/12",
        "id": 225866783,
        "number": 12,
        "title": "hello,I have a problem.",
        "user": {
          "login": "duanjunxiao",
          "id": 13999596,
          "avatar_url": "https://avatars0.githubusercontent.com/u/13999596?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/duanjunxiao",
          "html_url": "https://github.com/duanjunxiao",
          "followers_url": "https://api.github.com/users/duanjunxiao/followers",
          "following_url": "https://api.github.com/users/duanjunxiao/following{/other_user}",
          "gists_url": "https://api.github.com/users/duanjunxiao/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/duanjunxiao/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/duanjunxiao/subscriptions",
          "organizations_url": "https://api.github.com/users/duanjunxiao/orgs",
          "repos_url": "https://api.github.com/users/duanjunxiao/repos",
          "events_url": "https://api.github.com/users/duanjunxiao/events{/privacy}",
          "received_events_url": "https://api.github.com/users/duanjunxiao/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 1,
        "created_at": "2017-05-03T01:47:04Z",
        "updated_at": "2017-05-03T04:17:26Z",
        "closed_at": null,
        "body": "` + "```" + `\r\nbash-3.2$ go get -u -d github.com/coreos/etcd/...\r\n# cd .; git clone https://github.com/mattn/go-runewidth /Users/admin/go/src/github.com/mattn/go-runewidth\r\nfatal: could not create work tree dir '/Users/admin/go/src/github.com/mattn/go-runewidth': Permission denied\r\npackage github.com/mattn/go-runewidth: exit status 128\r\n` + "```" + `"
      },
      "comment": {
        "url": "https://api.github.com/repos/mattn/go-runewidth/issues/comments/298819961",
        "html_url": "https://github.com/mattn/go-runewidth/issues/12#issuecomment-298819961",
        "issue_url": "https://api.github.com/repos/mattn/go-runewidth/issues/12",
        "id": 298819961,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-03T04:17:26Z",
        "updated_at": "2017-05-03T04:17:26Z",
        "body": "That looks like an issue local to your setup, not an issue wit this package.\r\n\r\nIt seems you don't have write permissions in ` + "`" + `/Users/admin/go/src/github.com/mattn/go-runewidth` + "`" + ` directory, or whichever parent exists. It's unable to create a directory in order to clone the repository."
      }
    },
    "public": true,
    "created_at": "2017-05-03T04:17:26Z"
  },
  {
    "id": "5798823453",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 16196540,
      "name": "shurcooL/Go-Package-Store",
      "url": "https://api.github.com/repos/shurcooL/Go-Package-Store"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/shurcooL/Go-Package-Store/issues/78",
        "repository_url": "https://api.github.com/repos/shurcooL/Go-Package-Store",
        "labels_url": "https://api.github.com/repos/shurcooL/Go-Package-Store/issues/78/labels{/name}",
        "comments_url": "https://api.github.com/repos/shurcooL/Go-Package-Store/issues/78/comments",
        "events_url": "https://api.github.com/repos/shurcooL/Go-Package-Store/issues/78/events",
        "html_url": "https://github.com/shurcooL/Go-Package-Store/issues/78",
        "id": 222371994,
        "number": 78,
        "title": "Now reports differences on extra .git in the remote URL",
        "user": {
          "login": "mvdan",
          "id": 3576549,
          "avatar_url": "https://avatars3.githubusercontent.com/u/3576549?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/mvdan",
          "html_url": "https://github.com/mvdan",
          "followers_url": "https://api.github.com/users/mvdan/followers",
          "following_url": "https://api.github.com/users/mvdan/following{/other_user}",
          "gists_url": "https://api.github.com/users/mvdan/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/mvdan/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/mvdan/subscriptions",
          "organizations_url": "https://api.github.com/users/mvdan/orgs",
          "repos_url": "https://api.github.com/users/mvdan/repos",
          "events_url": "https://api.github.com/users/mvdan/events{/privacy}",
          "received_events_url": "https://api.github.com/users/mvdan/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 171144193,
            "url": "https://api.github.com/repos/shurcooL/Go-Package-Store/labels/thinking",
            "name": "thinking",
            "color": "5319e7",
            "default": false
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 10,
        "created_at": "2017-04-18T10:32:45Z",
        "updated_at": "2017-05-03T03:57:53Z",
        "closed_at": null,
        "body": "I now see a bunch of these for my own repos:\r\n\r\n` + "```" + `\r\nskipping \"github.com/mvdan/gibot\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/gibot.git\r\n                (expected) git@github.com:mvdan/gibot\r\nskipping \"github.com/mvdan/sh\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/sh.git\r\n                (expected) git@github.com:mvdan/sh\r\nskipping \"github.com/mvdan/unparam\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/unparam.git\r\n                (expected) git@github.com:mvdan/unparam\r\nskipping \"github.com/mvdan/git-picked\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/git-picked.git\r\n                (expected) git@github.com:mvdan/git-picked\r\nskipping \"github.com/mvdan/goreduce\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/goreduce.git\r\n                (expected) git@github.com:mvdan/goreduce\r\nskipping \"github.com/mvdan/xurls\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/xurls.git\r\n                (expected) git@github.com:mvdan/xurls\r\nskipping \"github.com/mvdan/fdroidcl\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/fdroidcl.git\r\n                (expected) git@github.com:mvdan/fdroidcl\r\nskipping \"github.com/mvdan/interfacer\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/interfacer.git\r\n                (expected) git@github.com:mvdan/interfacer\r\nskipping \"github.com/mvdan/lint\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/lint.git\r\n                (expected) git@github.com:mvdan/lint\r\n` + "```" + `\r\n\r\nLikely related to recent changes in reporting differing branches and remotes. These clones haven't changed in months, and I wasn't seeing these when reporting the previous issues a couple of weeks ago."
      },
      "comment": {
        "url": "https://api.github.com/repos/shurcooL/Go-Package-Store/issues/comments/298818355",
        "html_url": "https://github.com/shurcooL/Go-Package-Store/issues/78#issuecomment-298818355",
        "issue_url": "https://api.github.com/repos/shurcooL/Go-Package-Store/issues/78",
        "id": 298818355,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-03T03:57:53Z",
        "updated_at": "2017-05-03T03:57:53Z",
        "body": "Thanks for explaining, I see what you mean.\r\n\r\nI personally don't mind dealing with some reports and redirecting people to a solution. I care much more about the Go project remaining opinionated and simple, about making the better long term decisions, and not begin to cater to the least common denominator. It already has a history of being strict about things (tabs vs spaces, consistent case of acronyms, gofmt, build errors on unused imports, etc.), which not everyone likes at first, but it unites people and leads to a better and simpler future.\r\n\r\nI really want to help maintain that as much as possible. But I realize the chances aren't great. :("
      }
    },
    "public": true,
    "created_at": "2017-05-03T03:57:53Z"
  },
  {
    "id": "5798746031",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 23096959,
      "name": "golang/go",
      "url": "https://api.github.com/repos/golang/go"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/golang/go/issues/20212",
        "repository_url": "https://api.github.com/repos/golang/go",
        "labels_url": "https://api.github.com/repos/golang/go/issues/20212/labels{/name}",
        "comments_url": "https://api.github.com/repos/golang/go/issues/20212/comments",
        "events_url": "https://api.github.com/repos/golang/go/issues/20212/events",
        "html_url": "https://github.com/golang/go/issues/20212",
        "id": 225746426,
        "number": 20212,
        "title": "usability: Need to add documentation for a binary in three different places",
        "user": {
          "login": "kevinburke",
          "id": 234019,
          "avatar_url": "https://avatars2.githubusercontent.com/u/234019?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/kevinburke",
          "html_url": "https://github.com/kevinburke",
          "followers_url": "https://api.github.com/users/kevinburke/followers",
          "following_url": "https://api.github.com/users/kevinburke/following{/other_user}",
          "gists_url": "https://api.github.com/users/kevinburke/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/kevinburke/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/kevinburke/subscriptions",
          "organizations_url": "https://api.github.com/users/kevinburke/orgs",
          "repos_url": "https://api.github.com/users/kevinburke/repos",
          "events_url": "https://api.github.com/users/kevinburke/events{/privacy}",
          "received_events_url": "https://api.github.com/users/kevinburke/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 150880209,
            "url": "https://api.github.com/repos/golang/go/labels/Documentation",
            "name": "Documentation",
            "color": "aaffaa",
            "default": false
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 4,
        "created_at": "2017-05-02T16:16:41Z",
        "updated_at": "2017-05-03T03:30:32Z",
        "closed_at": null,
        "body": "If I'm shipping a Go binary, generally, I need to add documentation in three different places:\r\n\r\n- a README or README.md file, for people visiting the project via Github. This contains usage information and usually also installation information\r\n\r\n- in ` + "`" + `doc.go` + "`" + ` or similar, so it appears via godoc. [Some go tools document this well][godoc], but many tools fall down on the docs here:\r\n\r\n    - https://godoc.org/github.com/golang/dep/cmd/dep\r\n    - https://godoc.org/golang.org/x/build/maintner/maintnerd\r\n    - https://godoc.org/golang.org/x/build/cmd/gopherbot\r\n    - https://godoc.org/github.com/kubernetes/kubernetes/cmd/kubectl\r\n    - https://godoc.org/github.com/moby/moby/cmd/docker\r\n    - https://godoc.org/github.com/spf13/hugo\r\n\r\n- in ` + "`" + `flag.Usage` + "`" + `, so it looks nice when printed at the command line, and shows you the various arguments you can run.\r\n\r\n[godoc]: https://godoc.org/golang.org/x/tools/cmd/godoc\r\n\r\nIt's a shame that maintainers have to more or less write the same docs in triplicate, and a bad experience for our users when they forget to do so in one or more of the places above. \r\n\r\nI also wonder if this discourages contribution, when people get to a Github source code page and the results are clearly not formatted for browsing on that site.\r\n\r\nI'm wondering what we can do to ease the burden on maintainers, or make it easy to copy docs from one place to another. I understand that the audiences for each documentation place overlap in parts and don't overlap in other parts, but I imagine some docs are better than nothing. Here are some bad ideas:\r\n\r\n- If a ` + "`" + `main` + "`" + ` function has no package docs, but modifies ` + "`" + `flag.CommandLine` + "`" + `, godoc could call ` + "`" + `flag.PrintDefaults` + "`" + `, or call the binary with ` + "`" + `-h` + "`" + ` and then print the result. Note the godoc docs linked above manually copy the output from flag.PrintDefaults and it occasionally gets out of sync.\r\n\r\n- If a ` + "`" + `main` + "`" + ` function has no package docs but has a README.md, ` + "`" + `godoc` + "`" + ` could format README.md and ignore the parts of the markdown spec that we don't want to implement.\r\n\r\n- We could try to get Github to understand and display Go code, the same way [it can currently display a number of formats][formats] like Restructured Text, ASCIIDOC, Creole, RDoc, textile and others.\r\n\r\n[formats]: https://github.com/github/markup"
      },
      "comment": {
        "url": "https://api.github.com/repos/golang/go/issues/comments/298815952",
        "html_url": "https://github.com/golang/go/issues/20212#issuecomment-298815952",
        "issue_url": "https://api.github.com/repos/golang/go/issues/20212",
        "id": 298815952,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-03T03:30:32Z",
        "updated_at": "2017-05-03T03:30:32Z",
        "body": "> godoc could ... call the binary with ` + "`" + `-h` + "`" + ` and then print the result.\r\n\r\nYou'd need to do this in a safe execution environment, since you're executing arbitrary binaries (any user code can be inside ` + "`" + `flag.Usage` + "`" + `). I've wanted to add a tab to gotools.org that does that, but it hasn't happened.\r\n\r\n> We could try to get Github to understand and display Go code, the same way it can currently display a number of formats like Restructured Text, ASCIIDOC, Creole, RDoc, textile and others.\r\n\r\nThat could be really nice. If GitHub would just display a package summary via ` + "`" + `godoc` + "`" + ` when README.md isn't present, I wouldn't have to keep generating them. But it also sounds far fetched/a lot of work to make it happen.\r\n\r\n> Didn't somebody once write a tool to auto-generate a README.md file from the Go program's source code?\r\n\r\nI generate all of my Go package README.md files (and some other boilerplate, like .travis.yml) with [gorepogen](https://godoc.org/github.com/shurcooL/cmd/gorepogen). See an example [here](https://github.com/shurcooL/vcsstate/blob/master/README.md). But it's pretty much customized exactly for my preferences. As I understand, people tend to make their own version of such a tool for their own needs."
      }
    },
    "public": true,
    "created_at": "2017-05-03T03:30:34Z",
    "org": {
      "id": 4314092,
      "login": "golang",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/golang",
      "avatar_url": "https://avatars.githubusercontent.com/u/4314092?"
    }
  },
  {
    "id": "5798649746",
    "type": "CommitCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930469,
      "name": "shurcooL/resume",
      "url": "https://api.github.com/repos/shurcooL/resume"
    },
    "payload": {
      "comment": {
        "url": "https://api.github.com/repos/shurcooL/resume/comments/21993076",
        "html_url": "https://github.com/shurcooL/resume/commit/a41256353ba40297bab6bb68be30c8b6980ece58#commitcomment-21993076",
        "id": 21993076,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "position": null,
        "line": null,
        "path": null,
        "commit_id": "a41256353ba40297bab6bb68be30c8b6980ece58",
        "created_at": "2017-05-03T02:57:03Z",
        "updated_at": "2017-05-03T02:57:03Z",
        "body": "Also see https://godoc.org/github.com/shurcooL/notificationsapp/httpclient#example-NewNotifications for a usage example of [` + "`" + `httpclient.NewNotifications` + "`" + `](https://godoc.org/github.com/shurcooL/notificationsapp/httpclient#NewNotifications)."
      }
    },
    "public": true,
    "created_at": "2017-05-03T02:57:03Z"
  },
  {
    "id": "5798632830",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930476,
      "name": "shurcooL/home",
      "url": "https://api.github.com/repos/shurcooL/home"
    },
    "payload": {
      "push_id": 1715906500,
      "size": 4,
      "distinct_size": 4,
      "ref": "refs/heads/master",
      "head": "46ea901d6af8dc13195066172f75268c138e14f0",
      "before": "787f4bec9fb4bf95c4575f1f32ad55a05f32a264",
      "commits": [
        {
          "sha": "bb81ea1f7bde18cdb0bbdac80cfb459245dcfac4",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Consistently map os.IsPermission(err) to 403 Forbidden.\n\nUsing http.StatusUnauthorized with \"403 Forbidden\" error message was an\noversight, as far as I can tell.\n\nFollows shurcooL/notificationsapp@c07c06a00a338e0886fc8fb93b6c897889534828.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/home/commits/bb81ea1f7bde18cdb0bbdac80cfb459245dcfac4"
        },
        {
          "sha": "d653a74fc11414943e9fc909304cab196fdd745f",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Minor clean up.\n\nNo changes in behavior, just improvements to readability and\nconsistency.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/home/commits/d653a74fc11414943e9fc909304cab196fdd745f"
        },
        {
          "sha": "14dde29aacedb8a8c3d8dd6732e147cdad1ae4a8",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Change notifications API to use header authentication.\n\nCreate apiMiddleware for parsing Authorization header from requests,\nand looking up user via that header.\n\nUse it on all /api/notifications endpoints.\n\nMake access token cookie not HTTP only, since the frontend code will\nneed to access it to be able to authenticate for the notifications API.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/home/commits/14dde29aacedb8a8c3d8dd6732e147cdad1ae4a8"
        },
        {
          "sha": "46ea901d6af8dc13195066172f75268c138e14f0",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Regenerate.\n\ngo generate ./...",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/home/commits/46ea901d6af8dc13195066172f75268c138e14f0"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-03T02:51:16Z"
  },
  {
    "id": "5798630619",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 55930469,
      "name": "shurcooL/resume",
      "url": "https://api.github.com/repos/shurcooL/resume"
    },
    "payload": {
      "push_id": 1715905752,
      "size": 2,
      "distinct_size": 2,
      "ref": "refs/heads/master",
      "head": "a41256353ba40297bab6bb68be30c8b6980ece58",
      "before": "b506bf90621665c01fdea73c3980d0803f374164",
      "commits": [
        {
          "sha": "d6fd6766677cbc3cacbef8a78d922c49d7cc8a58",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Make notifications.Count error not fatal.\n\nLog it instead. It's better to display the resume, even if there was a\nproblem with counting notifications.\n\nThis is primarily done for frontend (where it's more likely to\nencounter an error), but it affects backend too.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/resume/commits/d6fd6766677cbc3cacbef8a78d922c49d7cc8a58"
        },
        {
          "sha": "a41256353ba40297bab6bb68be30c8b6980ece58",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "frontend: Use new notifications API client, auth via header.\n\nThis way, authentication is outsourced to a custom http.RoundTripper\nthat sets the Authorization header to a bearer access token.\nThis is consistent with how authentication is usually done on backend.\nFor example, see https://godoc.org/github.com/google/go-github/github#hdr-Authentication.\nAlso use golang.org/x/oauth2 package as the implementation of custom\nhttp.RoundTripper.\n\nIn fact, this way, authentication is done identically on frontend\nand backend!\n\nFetch the access token from the access token cookie that should be\navailable for authenticated users.\n\nFollows shurcooL/notificationsapp@eaaea8af7dd0b3692204814f59dbee767dd7499e\nand shurcooL/home@14dde29aacedb8a8c3d8dd6732e147cdad1ae4a8.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/resume/commits/a41256353ba40297bab6bb68be30c8b6980ece58"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-03T02:50:29Z"
  },
  {
    "id": "5798629738",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 58911163,
      "name": "shurcooL/notificationsapp",
      "url": "https://api.github.com/repos/shurcooL/notificationsapp"
    },
    "payload": {
      "push_id": 1715905453,
      "size": 2,
      "distinct_size": 2,
      "ref": "refs/heads/master",
      "head": "eaaea8af7dd0b3692204814f59dbee767dd7499e",
      "before": "b6bfbb7ecc5cafd3f5649e01810348ed14ec52ed",
      "commits": [
        {
          "sha": "c07c06a00a338e0886fc8fb93b6c897889534828",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Return 403 Forbidden on os.IsPermission(err).\n\nThis what was intended. It's not ideal, but it's more consistent.\n\nThis will be going away in the future, in favor of returning exact Go\nerror directly to caller for handling.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/notificationsapp/commits/c07c06a00a338e0886fc8fb93b6c897889534828"
        },
        {
          "sha": "eaaea8af7dd0b3692204814f59dbee767dd7499e",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "httpclient: Add HTTP client, base URL parameters.\n\nIt's now possible for the client to connect to a remote server, and use\na custom HTTP client with authentication.",
          "distinct": true,
          "url": "https://api.github.com/repos/shurcooL/notificationsapp/commits/eaaea8af7dd0b3692204814f59dbee767dd7499e"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-03T02:50:09Z"
  },
  {
    "id": "5795132172",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1812190,
      "name": "russross/blackfriday",
      "url": "https://api.github.com/repos/russross/blackfriday"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/russross/blackfriday/issues/353",
        "repository_url": "https://api.github.com/repos/russross/blackfriday",
        "labels_url": "https://api.github.com/repos/russross/blackfriday/issues/353/labels{/name}",
        "comments_url": "https://api.github.com/repos/russross/blackfriday/issues/353/comments",
        "events_url": "https://api.github.com/repos/russross/blackfriday/issues/353/events",
        "html_url": "https://github.com/russross/blackfriday/issues/353",
        "id": 225745790,
        "number": 353,
        "title": "Recommended method for previewing output?",
        "user": {
          "login": "dadatawajue",
          "id": 16490954,
          "avatar_url": "https://avatars2.githubusercontent.com/u/16490954?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/dadatawajue",
          "html_url": "https://github.com/dadatawajue",
          "followers_url": "https://api.github.com/users/dadatawajue/followers",
          "following_url": "https://api.github.com/users/dadatawajue/following{/other_user}",
          "gists_url": "https://api.github.com/users/dadatawajue/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/dadatawajue/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/dadatawajue/subscriptions",
          "organizations_url": "https://api.github.com/users/dadatawajue/orgs",
          "repos_url": "https://api.github.com/users/dadatawajue/repos",
          "events_url": "https://api.github.com/users/dadatawajue/events{/privacy}",
          "received_events_url": "https://api.github.com/users/dadatawajue/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 335902502,
            "url": "https://api.github.com/repos/russross/blackfriday/labels/question",
            "name": "question",
            "color": "cc317c",
            "default": true
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 0,
        "created_at": "2017-05-02T16:14:39Z",
        "updated_at": "2017-05-02T16:21:30Z",
        "closed_at": null,
        "body": "I was wondering what everyone is doing if they want to provide preview on the frontend. The way I see it, there are two good options:\r\n\r\n1. Use websockets to convert with blackfriday\r\n\r\n2. Use some external JavaScript library to convert\r\n\r\nOption 1 doesn't seem very cost efficient if it's updated on every input, whereas \r\nOption 2 will likely have differences in terms of how the markdown is converted.. \r\n\r\nDoes anyone know a JavaScript library that produce exact same output as blackfriday? or how is everyone else doing it?"
      },
      "comment": {
        "url": "https://api.github.com/repos/russross/blackfriday/issues/comments/298685557",
        "html_url": "https://github.com/russross/blackfriday/issues/353#issuecomment-298685557",
        "issue_url": "https://api.github.com/repos/russross/blackfriday/issues/353",
        "id": 298685557,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-02T16:21:30Z",
        "updated_at": "2017-05-02T16:21:30Z",
        "body": "People do different things, depending on their requirements, budget, etc.\r\n\r\n1. You can use a simple POST request to the backend, which uses blackfriday and sends rendered HTML as response. Using WebSocket is possible, but they're more heavyweight and not neccessary for the task.\r\n\r\n2. I've used GopherJS compiler to compile blackfriday to JavaScript, and used that on frontend. This way, it's guaranteed to have the same output, because it's the same code.\r\n\r\n> Option 1 doesn't seem very cost efficient if it's updated on every input\r\n\r\nYou might want to coalesce input and update less frequently. Example, after the content has stopped changing for 3 seconds. Or use a preview tab, similar to how github.com does it."
      }
    },
    "public": true,
    "created_at": "2017-05-02T16:21:30Z"
  },
  {
    "id": "5791354070",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1812190,
      "name": "russross/blackfriday",
      "url": "https://api.github.com/repos/russross/blackfriday"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/russross/blackfriday/pulls/comments/114250487",
        "pull_request_review_id": 35699780,
        "id": 114250487,
        "diff_hunk": "@@ -0,0 +1,32 @@\n+// Package blackfriday is a Markdown processor.\n+//\n+// It translates plain text with simple formatting rules into HTML or LaTeX.\n+//\n+// Sanitized Anchor Names\n+//\n+// Blackfriday includes an algorithm for creating sanitized anchor names\n+// corresponding to a given input text. This algorithm is used to create\n+// anchors for headings when EXTENSION_AUTO_HEADER_IDS is enabled. The\n+// algorithm is specified below, so that other packages can create\n+// compatible anchor names and links to those anchors.\n+//\n+// The algorithm iterates over the input text, interpreted as UTF-8,\n+// one Unicode code point (rune) at a time. All runes that are letters (category L)\n+// or numbers (category N) are considered valid characters. They are mapped to\n+// lower case, and included in the output. All other runes are considered\n+// invalid characters. Invalid characters that preceed the first valid character,\n+// as well as invalid character that follow the last valid character\n+// are dropped completely. All other sequences of invalid characters\n+// between two valid characters are replaced with a single dash character '-'.\n+//\n+// SanitizedAnchorName exposes this functionality, and can be used to\n+// create compatible links to the anchor names generated by blackfriday.\n+// This algorithm is also implemented in a small standalone package at\n+// github.com/shurcooL/sanitized_anchor_name. It can be useful for clients\n+// that want a small package and don't need full functionality of blackfriday.\n+package blackfriday",
        "path": "doc.go",
        "position": 27,
        "original_position": 27,
        "commit_id": "a417c2043477a438a7e80708786a79c58926cb9a",
        "original_commit_id": "a417c2043477a438a7e80708786a79c58926cb9a",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "Here's what it looks like, for reference.\r\n\r\n<details>\r\n\r\n![image](https://cloud.githubusercontent.com/assets/1924134/25605110/933f0756-2ed6-11e7-8eb7-cc1d87df0492.png)\r\n\r\n</details>",
        "created_at": "2017-05-02T05:28:14Z",
        "updated_at": "2017-05-02T05:28:14Z",
        "html_url": "https://github.com/russross/blackfriday/pull/352#discussion_r114250487",
        "pull_request_url": "https://api.github.com/repos/russross/blackfriday/pulls/352",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/comments/114250487"
          },
          "html": {
            "href": "https://github.com/russross/blackfriday/pull/352#discussion_r114250487"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/352"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/russross/blackfriday/pulls/352",
        "id": 118487136,
        "html_url": "https://github.com/russross/blackfriday/pull/352",
        "diff_url": "https://github.com/russross/blackfriday/pull/352.diff",
        "patch_url": "https://github.com/russross/blackfriday/pull/352.patch",
        "issue_url": "https://api.github.com/repos/russross/blackfriday/issues/352",
        "number": 352,
        "state": "open",
        "locked": false,
        "title": "Document SanitizedAnchorName algorithm, copy implementation.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "The goal of this change is to reduce number of non-standard library packages (repositories) that ` + "`" + `blackfriday` + "`" + ` imports [from 1](https://godoc.org/github.com/russross/blackfriday?import-graph&hide=2) to 0, and in turn, reduce the cost of importing ` + "`" + `blackfriday` + "`" + ` into other projects.\r\n\r\nDo so by documenting the algorithm of ` + "`" + `SanitizedAnchorName` + "`" + `, and include a copy of the small function inside ` + "`" + `blackfriday` + "`" + ` itself. The same functionality continues to be available in the original location, [` + "`" + `github.com/shurcooL/sanitized_anchor_name.Create` + "`" + `](https://godoc.org/github.com/shurcooL/sanitized_anchor_name#Create). It can be used by existing users and those that look for a small package, and don't need all of ` + "`" + `blackfriday` + "`" + ` functionality. Existing users of ` + "`" + `blackfriday` + "`" + ` can use the new ` + "`" + `SanitizedAnchorName` + "`" + ` function directly and avoid an extra package import.\r\n\r\nResolves #350.",
        "created_at": "2017-05-02T05:15:41Z",
        "updated_at": "2017-05-02T05:28:14Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "a12710898ae13cafa99d52c277fd262c58885b3c",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/russross/blackfriday/pulls/352/commits",
        "review_comments_url": "https://api.github.com/repos/russross/blackfriday/pulls/352/comments",
        "review_comment_url": "https://api.github.com/repos/russross/blackfriday/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/russross/blackfriday/issues/352/comments",
        "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/a417c2043477a438a7e80708786a79c58926cb9a",
        "head": {
          "label": "russross:document-and-copy-sanitized_anchor_name",
          "ref": "document-and-copy-sanitized_anchor_name",
          "sha": "a417c2043477a438a7e80708786a79c58926cb9a",
          "user": {
            "login": "russross",
            "id": 65428,
            "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/russross",
            "html_url": "https://github.com/russross",
            "followers_url": "https://api.github.com/users/russross/followers",
            "following_url": "https://api.github.com/users/russross/following{/other_user}",
            "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
            "organizations_url": "https://api.github.com/users/russross/orgs",
            "repos_url": "https://api.github.com/users/russross/repos",
            "events_url": "https://api.github.com/users/russross/events{/privacy}",
            "received_events_url": "https://api.github.com/users/russross/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 1812190,
            "name": "blackfriday",
            "full_name": "russross/blackfriday",
            "owner": {
              "login": "russross",
              "id": 65428,
              "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/russross",
              "html_url": "https://github.com/russross",
              "followers_url": "https://api.github.com/users/russross/followers",
              "following_url": "https://api.github.com/users/russross/following{/other_user}",
              "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
              "organizations_url": "https://api.github.com/users/russross/orgs",
              "repos_url": "https://api.github.com/users/russross/repos",
              "events_url": "https://api.github.com/users/russross/events{/privacy}",
              "received_events_url": "https://api.github.com/users/russross/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/russross/blackfriday",
            "description": "Blackfriday: a markdown processor for Go",
            "fork": false,
            "url": "https://api.github.com/repos/russross/blackfriday",
            "forks_url": "https://api.github.com/repos/russross/blackfriday/forks",
            "keys_url": "https://api.github.com/repos/russross/blackfriday/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/russross/blackfriday/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/russross/blackfriday/teams",
            "hooks_url": "https://api.github.com/repos/russross/blackfriday/hooks",
            "issue_events_url": "https://api.github.com/repos/russross/blackfriday/issues/events{/number}",
            "events_url": "https://api.github.com/repos/russross/blackfriday/events",
            "assignees_url": "https://api.github.com/repos/russross/blackfriday/assignees{/user}",
            "branches_url": "https://api.github.com/repos/russross/blackfriday/branches{/branch}",
            "tags_url": "https://api.github.com/repos/russross/blackfriday/tags",
            "blobs_url": "https://api.github.com/repos/russross/blackfriday/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/russross/blackfriday/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/russross/blackfriday/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/russross/blackfriday/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/russross/blackfriday/languages",
            "stargazers_url": "https://api.github.com/repos/russross/blackfriday/stargazers",
            "contributors_url": "https://api.github.com/repos/russross/blackfriday/contributors",
            "subscribers_url": "https://api.github.com/repos/russross/blackfriday/subscribers",
            "subscription_url": "https://api.github.com/repos/russross/blackfriday/subscription",
            "commits_url": "https://api.github.com/repos/russross/blackfriday/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/russross/blackfriday/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/russross/blackfriday/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/russross/blackfriday/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/russross/blackfriday/contents/{+path}",
            "compare_url": "https://api.github.com/repos/russross/blackfriday/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/russross/blackfriday/merges",
            "archive_url": "https://api.github.com/repos/russross/blackfriday/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/russross/blackfriday/downloads",
            "issues_url": "https://api.github.com/repos/russross/blackfriday/issues{/number}",
            "pulls_url": "https://api.github.com/repos/russross/blackfriday/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/russross/blackfriday/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/russross/blackfriday/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/russross/blackfriday/labels{/name}",
            "releases_url": "https://api.github.com/repos/russross/blackfriday/releases{/id}",
            "deployments_url": "https://api.github.com/repos/russross/blackfriday/deployments",
            "created_at": "2011-05-27T22:28:58Z",
            "updated_at": "2017-05-01T08:34:16Z",
            "pushed_at": "2017-05-02T05:15:42Z",
            "git_url": "git://github.com/russross/blackfriday.git",
            "ssh_url": "git@github.com:russross/blackfriday.git",
            "clone_url": "https://github.com/russross/blackfriday.git",
            "svn_url": "https://github.com/russross/blackfriday",
            "homepage": "",
            "size": 1170,
            "stargazers_count": 2382,
            "watchers_count": 2382,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 306,
            "mirror_url": null,
            "open_issues_count": 79,
            "forks": 306,
            "open_issues": 79,
            "watchers": 2382,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "russross:master",
          "ref": "master",
          "sha": "b253417e1cb644d645a0a3bb1fa5034c8030127c",
          "user": {
            "login": "russross",
            "id": 65428,
            "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/russross",
            "html_url": "https://github.com/russross",
            "followers_url": "https://api.github.com/users/russross/followers",
            "following_url": "https://api.github.com/users/russross/following{/other_user}",
            "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
            "organizations_url": "https://api.github.com/users/russross/orgs",
            "repos_url": "https://api.github.com/users/russross/repos",
            "events_url": "https://api.github.com/users/russross/events{/privacy}",
            "received_events_url": "https://api.github.com/users/russross/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 1812190,
            "name": "blackfriday",
            "full_name": "russross/blackfriday",
            "owner": {
              "login": "russross",
              "id": 65428,
              "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/russross",
              "html_url": "https://github.com/russross",
              "followers_url": "https://api.github.com/users/russross/followers",
              "following_url": "https://api.github.com/users/russross/following{/other_user}",
              "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
              "organizations_url": "https://api.github.com/users/russross/orgs",
              "repos_url": "https://api.github.com/users/russross/repos",
              "events_url": "https://api.github.com/users/russross/events{/privacy}",
              "received_events_url": "https://api.github.com/users/russross/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/russross/blackfriday",
            "description": "Blackfriday: a markdown processor for Go",
            "fork": false,
            "url": "https://api.github.com/repos/russross/blackfriday",
            "forks_url": "https://api.github.com/repos/russross/blackfriday/forks",
            "keys_url": "https://api.github.com/repos/russross/blackfriday/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/russross/blackfriday/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/russross/blackfriday/teams",
            "hooks_url": "https://api.github.com/repos/russross/blackfriday/hooks",
            "issue_events_url": "https://api.github.com/repos/russross/blackfriday/issues/events{/number}",
            "events_url": "https://api.github.com/repos/russross/blackfriday/events",
            "assignees_url": "https://api.github.com/repos/russross/blackfriday/assignees{/user}",
            "branches_url": "https://api.github.com/repos/russross/blackfriday/branches{/branch}",
            "tags_url": "https://api.github.com/repos/russross/blackfriday/tags",
            "blobs_url": "https://api.github.com/repos/russross/blackfriday/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/russross/blackfriday/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/russross/blackfriday/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/russross/blackfriday/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/russross/blackfriday/languages",
            "stargazers_url": "https://api.github.com/repos/russross/blackfriday/stargazers",
            "contributors_url": "https://api.github.com/repos/russross/blackfriday/contributors",
            "subscribers_url": "https://api.github.com/repos/russross/blackfriday/subscribers",
            "subscription_url": "https://api.github.com/repos/russross/blackfriday/subscription",
            "commits_url": "https://api.github.com/repos/russross/blackfriday/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/russross/blackfriday/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/russross/blackfriday/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/russross/blackfriday/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/russross/blackfriday/contents/{+path}",
            "compare_url": "https://api.github.com/repos/russross/blackfriday/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/russross/blackfriday/merges",
            "archive_url": "https://api.github.com/repos/russross/blackfriday/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/russross/blackfriday/downloads",
            "issues_url": "https://api.github.com/repos/russross/blackfriday/issues{/number}",
            "pulls_url": "https://api.github.com/repos/russross/blackfriday/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/russross/blackfriday/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/russross/blackfriday/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/russross/blackfriday/labels{/name}",
            "releases_url": "https://api.github.com/repos/russross/blackfriday/releases{/id}",
            "deployments_url": "https://api.github.com/repos/russross/blackfriday/deployments",
            "created_at": "2011-05-27T22:28:58Z",
            "updated_at": "2017-05-01T08:34:16Z",
            "pushed_at": "2017-05-02T05:15:42Z",
            "git_url": "git://github.com/russross/blackfriday.git",
            "ssh_url": "git@github.com:russross/blackfriday.git",
            "clone_url": "https://github.com/russross/blackfriday.git",
            "svn_url": "https://github.com/russross/blackfriday",
            "homepage": "",
            "size": 1170,
            "stargazers_count": 2382,
            "watchers_count": 2382,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 306,
            "mirror_url": null,
            "open_issues_count": 79,
            "forks": 306,
            "open_issues": 79,
            "watchers": 2382,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/352"
          },
          "html": {
            "href": "https://github.com/russross/blackfriday/pull/352"
          },
          "issue": {
            "href": "https://api.github.com/repos/russross/blackfriday/issues/352"
          },
          "comments": {
            "href": "https://api.github.com/repos/russross/blackfriday/issues/352/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/352/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/352/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/russross/blackfriday/statuses/a417c2043477a438a7e80708786a79c58926cb9a"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-02T05:28:14Z"
  },
  {
    "id": "5791321202",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1812190,
      "name": "russross/blackfriday",
      "url": "https://api.github.com/repos/russross/blackfriday"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/russross/blackfriday/issues/350",
        "repository_url": "https://api.github.com/repos/russross/blackfriday",
        "labels_url": "https://api.github.com/repos/russross/blackfriday/issues/350/labels{/name}",
        "comments_url": "https://api.github.com/repos/russross/blackfriday/issues/350/comments",
        "events_url": "https://api.github.com/repos/russross/blackfriday/issues/350/events",
        "html_url": "https://github.com/russross/blackfriday/issues/350",
        "id": 224614606,
        "number": 350,
        "title": "copy sanitized_anchor_name to blackfriday",
        "user": {
          "login": "adg",
          "id": 8446613,
          "avatar_url": "https://avatars3.githubusercontent.com/u/8446613?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/adg",
          "html_url": "https://github.com/adg",
          "followers_url": "https://api.github.com/users/adg/followers",
          "following_url": "https://api.github.com/users/adg/following{/other_user}",
          "gists_url": "https://api.github.com/users/adg/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/adg/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/adg/subscriptions",
          "organizations_url": "https://api.github.com/users/adg/orgs",
          "repos_url": "https://api.github.com/users/adg/repos",
          "events_url": "https://api.github.com/users/adg/events{/privacy}",
          "received_events_url": "https://api.github.com/users/adg/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 10,
        "created_at": "2017-04-26T22:11:42Z",
        "updated_at": "2017-05-02T05:17:00Z",
        "closed_at": null,
        "body": "The ` + "`" + `blackfriday` + "`" + ` package only has one external dependency: ` + "`" + `github.com/shurcooL/sanitized_anchor_name` + "`" + `\r\n\r\nThat repo provides a single ~20-line function. Can we copy it into this repository to remove the external dependency? \r\n\r\ncc @shurcooL "
      },
      "comment": {
        "url": "https://api.github.com/repos/russross/blackfriday/issues/comments/298499452",
        "html_url": "https://github.com/russross/blackfriday/issues/350#issuecomment-298499452",
        "issue_url": "https://api.github.com/repos/russross/blackfriday/issues/350",
        "id": 298499452,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-02T05:17:00Z",
        "updated_at": "2017-05-02T05:17:00Z",
        "body": "I took a stab at resolving this issue in PR #352. It's just a first draft, I welcome feedback and suggestions. @adg, can you take a look and see what you think?"
      }
    },
    "public": true,
    "created_at": "2017-05-02T05:17:01Z"
  },
  {
    "id": "5791317538",
    "type": "PullRequestEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1812190,
      "name": "russross/blackfriday",
      "url": "https://api.github.com/repos/russross/blackfriday"
    },
    "payload": {
      "action": "opened",
      "number": 352,
      "pull_request": {
        "url": "https://api.github.com/repos/russross/blackfriday/pulls/352",
        "id": 118487136,
        "html_url": "https://github.com/russross/blackfriday/pull/352",
        "diff_url": "https://github.com/russross/blackfriday/pull/352.diff",
        "patch_url": "https://github.com/russross/blackfriday/pull/352.patch",
        "issue_url": "https://api.github.com/repos/russross/blackfriday/issues/352",
        "number": 352,
        "state": "open",
        "locked": false,
        "title": "Document SanitizedAnchorName algorithm, copy implementation.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "The goal of this change is to reduce number of non-standard library packages (repositories) that ` + "`" + `blackfriday` + "`" + ` imports [from 1](https://godoc.org/github.com/russross/blackfriday?import-graph&hide=2) to 0, and in turn, reduce the cost of importing ` + "`" + `blackfriday` + "`" + ` into other projects.\r\n\r\nDo so by documenting the algorithm of ` + "`" + `SanitizedAnchorName` + "`" + `, and include a copy of the small function inside ` + "`" + `blackfriday` + "`" + ` itself. The same functionality continues to be available in the original location, [` + "`" + `github.com/shurcooL/sanitized_anchor_name.Create` + "`" + `](https://godoc.org/github.com/shurcooL/sanitized_anchor_name#Create). It can be used by existing users and those that look for a small package, and don't need all of ` + "`" + `blackfriday` + "`" + ` functionality. Existing users of ` + "`" + `blackfriday` + "`" + ` can use the new ` + "`" + `SanitizedAnchorName` + "`" + ` function directly and avoid an extra package import.\r\n\r\nResolves #350.",
        "created_at": "2017-05-02T05:15:41Z",
        "updated_at": "2017-05-02T05:15:41Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": null,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/russross/blackfriday/pulls/352/commits",
        "review_comments_url": "https://api.github.com/repos/russross/blackfriday/pulls/352/comments",
        "review_comment_url": "https://api.github.com/repos/russross/blackfriday/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/russross/blackfriday/issues/352/comments",
        "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/a417c2043477a438a7e80708786a79c58926cb9a",
        "head": {
          "label": "russross:document-and-copy-sanitized_anchor_name",
          "ref": "document-and-copy-sanitized_anchor_name",
          "sha": "a417c2043477a438a7e80708786a79c58926cb9a",
          "user": {
            "login": "russross",
            "id": 65428,
            "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/russross",
            "html_url": "https://github.com/russross",
            "followers_url": "https://api.github.com/users/russross/followers",
            "following_url": "https://api.github.com/users/russross/following{/other_user}",
            "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
            "organizations_url": "https://api.github.com/users/russross/orgs",
            "repos_url": "https://api.github.com/users/russross/repos",
            "events_url": "https://api.github.com/users/russross/events{/privacy}",
            "received_events_url": "https://api.github.com/users/russross/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 1812190,
            "name": "blackfriday",
            "full_name": "russross/blackfriday",
            "owner": {
              "login": "russross",
              "id": 65428,
              "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/russross",
              "html_url": "https://github.com/russross",
              "followers_url": "https://api.github.com/users/russross/followers",
              "following_url": "https://api.github.com/users/russross/following{/other_user}",
              "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
              "organizations_url": "https://api.github.com/users/russross/orgs",
              "repos_url": "https://api.github.com/users/russross/repos",
              "events_url": "https://api.github.com/users/russross/events{/privacy}",
              "received_events_url": "https://api.github.com/users/russross/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/russross/blackfriday",
            "description": "Blackfriday: a markdown processor for Go",
            "fork": false,
            "url": "https://api.github.com/repos/russross/blackfriday",
            "forks_url": "https://api.github.com/repos/russross/blackfriday/forks",
            "keys_url": "https://api.github.com/repos/russross/blackfriday/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/russross/blackfriday/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/russross/blackfriday/teams",
            "hooks_url": "https://api.github.com/repos/russross/blackfriday/hooks",
            "issue_events_url": "https://api.github.com/repos/russross/blackfriday/issues/events{/number}",
            "events_url": "https://api.github.com/repos/russross/blackfriday/events",
            "assignees_url": "https://api.github.com/repos/russross/blackfriday/assignees{/user}",
            "branches_url": "https://api.github.com/repos/russross/blackfriday/branches{/branch}",
            "tags_url": "https://api.github.com/repos/russross/blackfriday/tags",
            "blobs_url": "https://api.github.com/repos/russross/blackfriday/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/russross/blackfriday/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/russross/blackfriday/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/russross/blackfriday/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/russross/blackfriday/languages",
            "stargazers_url": "https://api.github.com/repos/russross/blackfriday/stargazers",
            "contributors_url": "https://api.github.com/repos/russross/blackfriday/contributors",
            "subscribers_url": "https://api.github.com/repos/russross/blackfriday/subscribers",
            "subscription_url": "https://api.github.com/repos/russross/blackfriday/subscription",
            "commits_url": "https://api.github.com/repos/russross/blackfriday/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/russross/blackfriday/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/russross/blackfriday/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/russross/blackfriday/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/russross/blackfriday/contents/{+path}",
            "compare_url": "https://api.github.com/repos/russross/blackfriday/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/russross/blackfriday/merges",
            "archive_url": "https://api.github.com/repos/russross/blackfriday/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/russross/blackfriday/downloads",
            "issues_url": "https://api.github.com/repos/russross/blackfriday/issues{/number}",
            "pulls_url": "https://api.github.com/repos/russross/blackfriday/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/russross/blackfriday/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/russross/blackfriday/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/russross/blackfriday/labels{/name}",
            "releases_url": "https://api.github.com/repos/russross/blackfriday/releases{/id}",
            "deployments_url": "https://api.github.com/repos/russross/blackfriday/deployments",
            "created_at": "2011-05-27T22:28:58Z",
            "updated_at": "2017-05-01T08:34:16Z",
            "pushed_at": "2017-05-02T05:13:07Z",
            "git_url": "git://github.com/russross/blackfriday.git",
            "ssh_url": "git@github.com:russross/blackfriday.git",
            "clone_url": "https://github.com/russross/blackfriday.git",
            "svn_url": "https://github.com/russross/blackfriday",
            "homepage": "",
            "size": 1170,
            "stargazers_count": 2382,
            "watchers_count": 2382,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 306,
            "mirror_url": null,
            "open_issues_count": 79,
            "forks": 306,
            "open_issues": 79,
            "watchers": 2382,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "russross:master",
          "ref": "master",
          "sha": "b253417e1cb644d645a0a3bb1fa5034c8030127c",
          "user": {
            "login": "russross",
            "id": 65428,
            "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/russross",
            "html_url": "https://github.com/russross",
            "followers_url": "https://api.github.com/users/russross/followers",
            "following_url": "https://api.github.com/users/russross/following{/other_user}",
            "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
            "organizations_url": "https://api.github.com/users/russross/orgs",
            "repos_url": "https://api.github.com/users/russross/repos",
            "events_url": "https://api.github.com/users/russross/events{/privacy}",
            "received_events_url": "https://api.github.com/users/russross/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 1812190,
            "name": "blackfriday",
            "full_name": "russross/blackfriday",
            "owner": {
              "login": "russross",
              "id": 65428,
              "avatar_url": "https://avatars2.githubusercontent.com/u/65428?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/russross",
              "html_url": "https://github.com/russross",
              "followers_url": "https://api.github.com/users/russross/followers",
              "following_url": "https://api.github.com/users/russross/following{/other_user}",
              "gists_url": "https://api.github.com/users/russross/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/russross/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/russross/subscriptions",
              "organizations_url": "https://api.github.com/users/russross/orgs",
              "repos_url": "https://api.github.com/users/russross/repos",
              "events_url": "https://api.github.com/users/russross/events{/privacy}",
              "received_events_url": "https://api.github.com/users/russross/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/russross/blackfriday",
            "description": "Blackfriday: a markdown processor for Go",
            "fork": false,
            "url": "https://api.github.com/repos/russross/blackfriday",
            "forks_url": "https://api.github.com/repos/russross/blackfriday/forks",
            "keys_url": "https://api.github.com/repos/russross/blackfriday/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/russross/blackfriday/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/russross/blackfriday/teams",
            "hooks_url": "https://api.github.com/repos/russross/blackfriday/hooks",
            "issue_events_url": "https://api.github.com/repos/russross/blackfriday/issues/events{/number}",
            "events_url": "https://api.github.com/repos/russross/blackfriday/events",
            "assignees_url": "https://api.github.com/repos/russross/blackfriday/assignees{/user}",
            "branches_url": "https://api.github.com/repos/russross/blackfriday/branches{/branch}",
            "tags_url": "https://api.github.com/repos/russross/blackfriday/tags",
            "blobs_url": "https://api.github.com/repos/russross/blackfriday/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/russross/blackfriday/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/russross/blackfriday/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/russross/blackfriday/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/russross/blackfriday/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/russross/blackfriday/languages",
            "stargazers_url": "https://api.github.com/repos/russross/blackfriday/stargazers",
            "contributors_url": "https://api.github.com/repos/russross/blackfriday/contributors",
            "subscribers_url": "https://api.github.com/repos/russross/blackfriday/subscribers",
            "subscription_url": "https://api.github.com/repos/russross/blackfriday/subscription",
            "commits_url": "https://api.github.com/repos/russross/blackfriday/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/russross/blackfriday/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/russross/blackfriday/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/russross/blackfriday/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/russross/blackfriday/contents/{+path}",
            "compare_url": "https://api.github.com/repos/russross/blackfriday/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/russross/blackfriday/merges",
            "archive_url": "https://api.github.com/repos/russross/blackfriday/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/russross/blackfriday/downloads",
            "issues_url": "https://api.github.com/repos/russross/blackfriday/issues{/number}",
            "pulls_url": "https://api.github.com/repos/russross/blackfriday/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/russross/blackfriday/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/russross/blackfriday/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/russross/blackfriday/labels{/name}",
            "releases_url": "https://api.github.com/repos/russross/blackfriday/releases{/id}",
            "deployments_url": "https://api.github.com/repos/russross/blackfriday/deployments",
            "created_at": "2011-05-27T22:28:58Z",
            "updated_at": "2017-05-01T08:34:16Z",
            "pushed_at": "2017-05-02T05:13:07Z",
            "git_url": "git://github.com/russross/blackfriday.git",
            "ssh_url": "git@github.com:russross/blackfriday.git",
            "clone_url": "https://github.com/russross/blackfriday.git",
            "svn_url": "https://github.com/russross/blackfriday",
            "homepage": "",
            "size": 1170,
            "stargazers_count": 2382,
            "watchers_count": 2382,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": true,
            "has_pages": false,
            "forks_count": 306,
            "mirror_url": null,
            "open_issues_count": 79,
            "forks": 306,
            "open_issues": 79,
            "watchers": 2382,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/352"
          },
          "html": {
            "href": "https://github.com/russross/blackfriday/pull/352"
          },
          "issue": {
            "href": "https://api.github.com/repos/russross/blackfriday/issues/352"
          },
          "comments": {
            "href": "https://api.github.com/repos/russross/blackfriday/issues/352/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/352/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/russross/blackfriday/pulls/352/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/russross/blackfriday/statuses/a417c2043477a438a7e80708786a79c58926cb9a"
          }
        },
        "merged": false,
        "mergeable": null,
        "rebaseable": null,
        "mergeable_state": "unknown",
        "merged_by": null,
        "comments": 0,
        "review_comments": 0,
        "maintainer_can_modify": false,
        "commits": 1,
        "additions": 120,
        "deletions": 7,
        "changed_files": 5
      }
    },
    "public": true,
    "created_at": "2017-05-02T05:15:41Z"
  },
  {
    "id": "5791310499",
    "type": "CreateEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1812190,
      "name": "russross/blackfriday",
      "url": "https://api.github.com/repos/russross/blackfriday"
    },
    "payload": {
      "ref": "document-and-copy-sanitized_anchor_name",
      "ref_type": "branch",
      "master_branch": "master",
      "description": "Blackfriday: a markdown processor for Go",
      "pusher_type": "user"
    },
    "public": true,
    "created_at": "2017-05-02T05:13:08Z"
  },
  {
    "id": "5791097086",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 30574078,
      "name": "golang/tour",
      "url": "https://api.github.com/repos/golang/tour"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/golang/tour/issues/146",
        "repository_url": "https://api.github.com/repos/golang/tour",
        "labels_url": "https://api.github.com/repos/golang/tour/issues/146/labels{/name}",
        "comments_url": "https://api.github.com/repos/golang/tour/issues/146/comments",
        "events_url": "https://api.github.com/repos/golang/tour/issues/146/events",
        "html_url": "https://github.com/golang/tour/issues/146",
        "id": 202004920,
        "number": 146,
        "title": "Update codemirror (editor) and enable some features",
        "user": {
          "login": "spf13",
          "id": 173412,
          "avatar_url": "https://avatars2.githubusercontent.com/u/173412?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/spf13",
          "html_url": "https://github.com/spf13",
          "followers_url": "https://api.github.com/users/spf13/followers",
          "following_url": "https://api.github.com/users/spf13/following{/other_user}",
          "gists_url": "https://api.github.com/users/spf13/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/spf13/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/spf13/subscriptions",
          "organizations_url": "https://api.github.com/users/spf13/orgs",
          "repos_url": "https://api.github.com/users/spf13/repos",
          "events_url": "https://api.github.com/users/spf13/events{/privacy}",
          "received_events_url": "https://api.github.com/users/spf13/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 1,
        "created_at": "2017-01-19T23:21:54Z",
        "updated_at": "2017-05-02T03:58:36Z",
        "closed_at": null,
        "body": "Go tour already uses http://codemirror.net/. It could benefit from an update as the version used is out of date.\r\n\r\nIt would also be nice to enable features like bracket (paran) matching. \r\n\r\nAutocomplete support would be a very nice to have as would linting. codemirror supports both but not sure how hard the integration would be with go-code."
      },
      "comment": {
        "url": "https://api.github.com/repos/golang/tour/issues/comments/298491867",
        "html_url": "https://github.com/golang/tour/issues/146#issuecomment-298491867",
        "issue_url": "https://api.github.com/repos/golang/tour/issues/146",
        "id": 298491867,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-02T03:58:36Z",
        "updated_at": "2017-05-02T03:58:36Z",
        "body": "The \"update to latest version of CodeMirror\" part of this issue has been done in the aforementioned CL. That leaves the \"would also be nice to enable features\" part.\r\n\r\nI want to ask for more information about that. What exactly do we want to enable, and how do we know it's going to be an improvement to the tour editor?\r\n\r\nMy concern is that different people have opposing desires for the editor. Some prefer to have fewer features, with minimal or no syntax highlighting, etc. Others prefer as many features as possible. How can we decide what features to enable without making the experience worse for some people?\r\n\r\nAnother factor is that I've seen in the history that features like paren matching were previously in the codebase, but later removed. E.g., see [CL 114480043](https://golang.org/cl/114480043) titled \"go-tour: remove brace matching addon and unused trailing space addon\" (created by @campoy, reviewed by @adg). It's a CL from 2014 and there's not much context in the commit message or the review, but any information on that would be helpful to make progress here. Thanks!"
      }
    },
    "public": true,
    "created_at": "2017-05-02T03:58:36Z",
    "org": {
      "id": 4314092,
      "login": "golang",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/golang",
      "avatar_url": "https://avatars.githubusercontent.com/u/4314092?"
    }
  },
  {
    "id": "5791053658",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 16196540,
      "name": "shurcooL/Go-Package-Store",
      "url": "https://api.github.com/repos/shurcooL/Go-Package-Store"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/shurcooL/Go-Package-Store/issues/78",
        "repository_url": "https://api.github.com/repos/shurcooL/Go-Package-Store",
        "labels_url": "https://api.github.com/repos/shurcooL/Go-Package-Store/issues/78/labels{/name}",
        "comments_url": "https://api.github.com/repos/shurcooL/Go-Package-Store/issues/78/comments",
        "events_url": "https://api.github.com/repos/shurcooL/Go-Package-Store/issues/78/events",
        "html_url": "https://github.com/shurcooL/Go-Package-Store/issues/78",
        "id": 222371994,
        "number": 78,
        "title": "Now reports differences on extra .git in the remote URL",
        "user": {
          "login": "mvdan",
          "id": 3576549,
          "avatar_url": "https://avatars3.githubusercontent.com/u/3576549?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/mvdan",
          "html_url": "https://github.com/mvdan",
          "followers_url": "https://api.github.com/users/mvdan/followers",
          "following_url": "https://api.github.com/users/mvdan/following{/other_user}",
          "gists_url": "https://api.github.com/users/mvdan/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/mvdan/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/mvdan/subscriptions",
          "organizations_url": "https://api.github.com/users/mvdan/orgs",
          "repos_url": "https://api.github.com/users/mvdan/repos",
          "events_url": "https://api.github.com/users/mvdan/events{/privacy}",
          "received_events_url": "https://api.github.com/users/mvdan/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 171144193,
            "url": "https://api.github.com/repos/shurcooL/Go-Package-Store/labels/thinking",
            "name": "thinking",
            "color": "5319e7",
            "default": false
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 8,
        "created_at": "2017-04-18T10:32:45Z",
        "updated_at": "2017-05-02T03:44:18Z",
        "closed_at": null,
        "body": "I now see a bunch of these for my own repos:\r\n\r\n` + "```" + `\r\nskipping \"github.com/mvdan/gibot\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/gibot.git\r\n                (expected) git@github.com:mvdan/gibot\r\nskipping \"github.com/mvdan/sh\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/sh.git\r\n                (expected) git@github.com:mvdan/sh\r\nskipping \"github.com/mvdan/unparam\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/unparam.git\r\n                (expected) git@github.com:mvdan/unparam\r\nskipping \"github.com/mvdan/git-picked\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/git-picked.git\r\n                (expected) git@github.com:mvdan/git-picked\r\nskipping \"github.com/mvdan/goreduce\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/goreduce.git\r\n                (expected) git@github.com:mvdan/goreduce\r\nskipping \"github.com/mvdan/xurls\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/xurls.git\r\n                (expected) git@github.com:mvdan/xurls\r\nskipping \"github.com/mvdan/fdroidcl\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/fdroidcl.git\r\n                (expected) git@github.com:mvdan/fdroidcl\r\nskipping \"github.com/mvdan/interfacer\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/interfacer.git\r\n                (expected) git@github.com:mvdan/interfacer\r\nskipping \"github.com/mvdan/lint\" because:\r\n        remote URL doesn't match repo URL inferred from import path:\r\n                  (actual) git@github.com:mvdan/lint.git\r\n                (expected) git@github.com:mvdan/lint\r\n` + "```" + `\r\n\r\nLikely related to recent changes in reporting differing branches and remotes. These clones haven't changed in months, and I wasn't seeing these when reporting the previous issues a couple of weeks ago."
      },
      "comment": {
        "url": "https://api.github.com/repos/shurcooL/Go-Package-Store/issues/comments/298490479",
        "html_url": "https://github.com/shurcooL/Go-Package-Store/issues/78#issuecomment-298490479",
        "issue_url": "https://api.github.com/repos/shurcooL/Go-Package-Store/issues/78",
        "id": 298490479,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-02T03:44:18Z",
        "updated_at": "2017-05-02T03:44:18Z",
        "body": "> From my point of view (user) this solution is unfortunate,\r\n\r\nI am finding it surprising that you still think that would be suboptimal for users, even after all the arguments presented here.\r\n\r\nI really want to do everything possible from my side to find the best solution, and to minimize the chance of a misunderstanding causing me to settle for a suboptimal solution. To that end, let me restate things as I see them, and ask you @mvdan to confirm my understanding is correct.\r\n\r\nAs I understand, ` + "`" + `go get` + "`" + ` has always cloned GitHub repositories without the optional \".git\" suffix (from Go 1.0 to today). So in a normal GOPATH, starting with an empty one, filled up with Go packages over time via invocations of ` + "`" + `go get` + "`" + `, all remotes will have no \".git\" suffix. Even if that GOPATH was created 8 years ago.\r\n\r\nThe only time that would be different is if people either manually cloned GitHub repositories with ` + "`" + `git clone` + "`" + ` and used \".git\" suffix, or if they manually modified the remote URL of a ` + "`" + `github.com/...` + "`" + ` Go package with ` + "`" + `git remote set-url origin something.git` + "`" + `.\r\n\r\nSo, if the \".git\" suffix were to be disallowed, these people would only have to do these things:\r\n\r\n1. Change only the repositories they've modified manually to include \".git\" suffix (something tools like Go Package Store can help with).\r\n2. In the future, do not add \".git\" suffix if cloning GitHub repositories manually instead of using ` + "`" + `go get` + "`" + `.\r\n\r\nThat's it.\r\n\r\nIs my my picture/understanding of the situation complete, or missing any factors? Is there any other reason why users would find it unfortunate?\r\n\r\nThanks for your help with this."
      }
    },
    "public": true,
    "created_at": "2017-05-02T03:44:18Z"
  },
  {
    "id": "5790868429",
    "type": "PullRequestReviewCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1712708,
      "name": "jlaffaye/ftp",
      "url": "https://api.github.com/repos/jlaffaye/ftp"
    },
    "payload": {
      "action": "created",
      "comment": {
        "url": "https://api.github.com/repos/jlaffaye/ftp/pulls/comments/114239646",
        "pull_request_review_id": 35688898,
        "id": 114239646,
        "diff_hunk": "@@ -537,11 +538,15 @@ func (r *Response) Read(buf []byte) (int, error) {\n \n // Close implements the io.Closer interface on a FTP data connection.\n func (r *Response) Close() error {\n+\tif r.connClosed == true {",
        "path": "ftp.go",
        "position": 43,
        "original_position": 43,
        "commit_id": "58864d889b55b7cf44ecc6fff245d4113cbe19e1",
        "original_commit_id": "58864d889b55b7cf44ecc6fff245d4113cbe19e1",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "This line can be simplified to ` + "`" + `if r.connClosed {` + "`" + `.",
        "created_at": "2017-05-02T02:39:51Z",
        "updated_at": "2017-05-02T02:43:14Z",
        "html_url": "https://github.com/jlaffaye/ftp/pull/87#discussion_r114239646",
        "pull_request_url": "https://api.github.com/repos/jlaffaye/ftp/pulls/87",
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/pulls/comments/114239646"
          },
          "html": {
            "href": "https://github.com/jlaffaye/ftp/pull/87#discussion_r114239646"
          },
          "pull_request": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/pulls/87"
          }
        }
      },
      "pull_request": {
        "url": "https://api.github.com/repos/jlaffaye/ftp/pulls/87",
        "id": 118470113,
        "html_url": "https://github.com/jlaffaye/ftp/pull/87",
        "diff_url": "https://github.com/jlaffaye/ftp/pull/87.diff",
        "patch_url": "https://github.com/jlaffaye/ftp/pull/87.patch",
        "issue_url": "https://api.github.com/repos/jlaffaye/ftp/issues/87",
        "number": 87,
        "state": "open",
        "locked": false,
        "title": "Avoid forever lock",
        "user": {
          "login": "DAddYE",
          "id": 6537,
          "avatar_url": "https://avatars0.githubusercontent.com/u/6537?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/DAddYE",
          "html_url": "https://github.com/DAddYE",
          "followers_url": "https://api.github.com/users/DAddYE/followers",
          "following_url": "https://api.github.com/users/DAddYE/following{/other_user}",
          "gists_url": "https://api.github.com/users/DAddYE/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/DAddYE/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/DAddYE/subscriptions",
          "organizations_url": "https://api.github.com/users/DAddYE/orgs",
          "repos_url": "https://api.github.com/users/DAddYE/repos",
          "events_url": "https://api.github.com/users/DAddYE/events{/privacy}",
          "received_events_url": "https://api.github.com/users/DAddYE/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "If we close the connection two times the second time will hang forever waiting for a server code.",
        "created_at": "2017-05-02T01:19:01Z",
        "updated_at": "2017-05-02T02:43:14Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": "1012ec80756069a8726299135f4bb1001b489b5a",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/jlaffaye/ftp/pulls/87/commits",
        "review_comments_url": "https://api.github.com/repos/jlaffaye/ftp/pulls/87/comments",
        "review_comment_url": "https://api.github.com/repos/jlaffaye/ftp/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/jlaffaye/ftp/issues/87/comments",
        "statuses_url": "https://api.github.com/repos/jlaffaye/ftp/statuses/58864d889b55b7cf44ecc6fff245d4113cbe19e1",
        "head": {
          "label": "DAddYE:patch-1",
          "ref": "patch-1",
          "sha": "58864d889b55b7cf44ecc6fff245d4113cbe19e1",
          "user": {
            "login": "DAddYE",
            "id": 6537,
            "avatar_url": "https://avatars0.githubusercontent.com/u/6537?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/DAddYE",
            "html_url": "https://github.com/DAddYE",
            "followers_url": "https://api.github.com/users/DAddYE/followers",
            "following_url": "https://api.github.com/users/DAddYE/following{/other_user}",
            "gists_url": "https://api.github.com/users/DAddYE/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/DAddYE/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/DAddYE/subscriptions",
            "organizations_url": "https://api.github.com/users/DAddYE/orgs",
            "repos_url": "https://api.github.com/users/DAddYE/repos",
            "events_url": "https://api.github.com/users/DAddYE/events{/privacy}",
            "received_events_url": "https://api.github.com/users/DAddYE/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 89977685,
            "name": "ftp",
            "full_name": "DAddYE/ftp",
            "owner": {
              "login": "DAddYE",
              "id": 6537,
              "avatar_url": "https://avatars0.githubusercontent.com/u/6537?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/DAddYE",
              "html_url": "https://github.com/DAddYE",
              "followers_url": "https://api.github.com/users/DAddYE/followers",
              "following_url": "https://api.github.com/users/DAddYE/following{/other_user}",
              "gists_url": "https://api.github.com/users/DAddYE/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/DAddYE/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/DAddYE/subscriptions",
              "organizations_url": "https://api.github.com/users/DAddYE/orgs",
              "repos_url": "https://api.github.com/users/DAddYE/repos",
              "events_url": "https://api.github.com/users/DAddYE/events{/privacy}",
              "received_events_url": "https://api.github.com/users/DAddYE/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/DAddYE/ftp",
            "description": "FTP client package for Go",
            "fork": true,
            "url": "https://api.github.com/repos/DAddYE/ftp",
            "forks_url": "https://api.github.com/repos/DAddYE/ftp/forks",
            "keys_url": "https://api.github.com/repos/DAddYE/ftp/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/DAddYE/ftp/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/DAddYE/ftp/teams",
            "hooks_url": "https://api.github.com/repos/DAddYE/ftp/hooks",
            "issue_events_url": "https://api.github.com/repos/DAddYE/ftp/issues/events{/number}",
            "events_url": "https://api.github.com/repos/DAddYE/ftp/events",
            "assignees_url": "https://api.github.com/repos/DAddYE/ftp/assignees{/user}",
            "branches_url": "https://api.github.com/repos/DAddYE/ftp/branches{/branch}",
            "tags_url": "https://api.github.com/repos/DAddYE/ftp/tags",
            "blobs_url": "https://api.github.com/repos/DAddYE/ftp/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/DAddYE/ftp/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/DAddYE/ftp/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/DAddYE/ftp/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/DAddYE/ftp/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/DAddYE/ftp/languages",
            "stargazers_url": "https://api.github.com/repos/DAddYE/ftp/stargazers",
            "contributors_url": "https://api.github.com/repos/DAddYE/ftp/contributors",
            "subscribers_url": "https://api.github.com/repos/DAddYE/ftp/subscribers",
            "subscription_url": "https://api.github.com/repos/DAddYE/ftp/subscription",
            "commits_url": "https://api.github.com/repos/DAddYE/ftp/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/DAddYE/ftp/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/DAddYE/ftp/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/DAddYE/ftp/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/DAddYE/ftp/contents/{+path}",
            "compare_url": "https://api.github.com/repos/DAddYE/ftp/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/DAddYE/ftp/merges",
            "archive_url": "https://api.github.com/repos/DAddYE/ftp/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/DAddYE/ftp/downloads",
            "issues_url": "https://api.github.com/repos/DAddYE/ftp/issues{/number}",
            "pulls_url": "https://api.github.com/repos/DAddYE/ftp/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/DAddYE/ftp/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/DAddYE/ftp/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/DAddYE/ftp/labels{/name}",
            "releases_url": "https://api.github.com/repos/DAddYE/ftp/releases{/id}",
            "deployments_url": "https://api.github.com/repos/DAddYE/ftp/deployments",
            "created_at": "2017-05-02T01:17:48Z",
            "updated_at": "2017-05-02T01:17:50Z",
            "pushed_at": "2017-05-02T01:56:57Z",
            "git_url": "git://github.com/DAddYE/ftp.git",
            "ssh_url": "git@github.com:DAddYE/ftp.git",
            "clone_url": "https://github.com/DAddYE/ftp.git",
            "svn_url": "https://github.com/DAddYE/ftp",
            "homepage": "",
            "size": 112,
            "stargazers_count": 0,
            "watchers_count": 0,
            "language": "Go",
            "has_issues": false,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 0,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 0,
            "open_issues": 0,
            "watchers": 0,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "jlaffaye:master",
          "ref": "master",
          "sha": "0895dc7f07e342edfc22cb884a51e34275cc1e4b",
          "user": {
            "login": "jlaffaye",
            "id": 92914,
            "avatar_url": "https://avatars1.githubusercontent.com/u/92914?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/jlaffaye",
            "html_url": "https://github.com/jlaffaye",
            "followers_url": "https://api.github.com/users/jlaffaye/followers",
            "following_url": "https://api.github.com/users/jlaffaye/following{/other_user}",
            "gists_url": "https://api.github.com/users/jlaffaye/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/jlaffaye/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/jlaffaye/subscriptions",
            "organizations_url": "https://api.github.com/users/jlaffaye/orgs",
            "repos_url": "https://api.github.com/users/jlaffaye/repos",
            "events_url": "https://api.github.com/users/jlaffaye/events{/privacy}",
            "received_events_url": "https://api.github.com/users/jlaffaye/received_events",
            "type": "User",
            "site_admin": false
          },
          "repo": {
            "id": 1712708,
            "name": "ftp",
            "full_name": "jlaffaye/ftp",
            "owner": {
              "login": "jlaffaye",
              "id": 92914,
              "avatar_url": "https://avatars1.githubusercontent.com/u/92914?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/jlaffaye",
              "html_url": "https://github.com/jlaffaye",
              "followers_url": "https://api.github.com/users/jlaffaye/followers",
              "following_url": "https://api.github.com/users/jlaffaye/following{/other_user}",
              "gists_url": "https://api.github.com/users/jlaffaye/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/jlaffaye/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/jlaffaye/subscriptions",
              "organizations_url": "https://api.github.com/users/jlaffaye/orgs",
              "repos_url": "https://api.github.com/users/jlaffaye/repos",
              "events_url": "https://api.github.com/users/jlaffaye/events{/privacy}",
              "received_events_url": "https://api.github.com/users/jlaffaye/received_events",
              "type": "User",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/jlaffaye/ftp",
            "description": "FTP client package for Go",
            "fork": false,
            "url": "https://api.github.com/repos/jlaffaye/ftp",
            "forks_url": "https://api.github.com/repos/jlaffaye/ftp/forks",
            "keys_url": "https://api.github.com/repos/jlaffaye/ftp/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/jlaffaye/ftp/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/jlaffaye/ftp/teams",
            "hooks_url": "https://api.github.com/repos/jlaffaye/ftp/hooks",
            "issue_events_url": "https://api.github.com/repos/jlaffaye/ftp/issues/events{/number}",
            "events_url": "https://api.github.com/repos/jlaffaye/ftp/events",
            "assignees_url": "https://api.github.com/repos/jlaffaye/ftp/assignees{/user}",
            "branches_url": "https://api.github.com/repos/jlaffaye/ftp/branches{/branch}",
            "tags_url": "https://api.github.com/repos/jlaffaye/ftp/tags",
            "blobs_url": "https://api.github.com/repos/jlaffaye/ftp/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/jlaffaye/ftp/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/jlaffaye/ftp/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/jlaffaye/ftp/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/jlaffaye/ftp/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/jlaffaye/ftp/languages",
            "stargazers_url": "https://api.github.com/repos/jlaffaye/ftp/stargazers",
            "contributors_url": "https://api.github.com/repos/jlaffaye/ftp/contributors",
            "subscribers_url": "https://api.github.com/repos/jlaffaye/ftp/subscribers",
            "subscription_url": "https://api.github.com/repos/jlaffaye/ftp/subscription",
            "commits_url": "https://api.github.com/repos/jlaffaye/ftp/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/jlaffaye/ftp/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/jlaffaye/ftp/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/jlaffaye/ftp/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/jlaffaye/ftp/contents/{+path}",
            "compare_url": "https://api.github.com/repos/jlaffaye/ftp/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/jlaffaye/ftp/merges",
            "archive_url": "https://api.github.com/repos/jlaffaye/ftp/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/jlaffaye/ftp/downloads",
            "issues_url": "https://api.github.com/repos/jlaffaye/ftp/issues{/number}",
            "pulls_url": "https://api.github.com/repos/jlaffaye/ftp/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/jlaffaye/ftp/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/jlaffaye/ftp/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/jlaffaye/ftp/labels{/name}",
            "releases_url": "https://api.github.com/repos/jlaffaye/ftp/releases{/id}",
            "deployments_url": "https://api.github.com/repos/jlaffaye/ftp/deployments",
            "created_at": "2011-05-06T18:31:51Z",
            "updated_at": "2017-05-01T14:02:17Z",
            "pushed_at": "2017-05-02T01:56:58Z",
            "git_url": "git://github.com/jlaffaye/ftp.git",
            "ssh_url": "git@github.com:jlaffaye/ftp.git",
            "clone_url": "https://github.com/jlaffaye/ftp.git",
            "svn_url": "https://github.com/jlaffaye/ftp",
            "homepage": "",
            "size": 111,
            "stargazers_count": 203,
            "watchers_count": 203,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 102,
            "mirror_url": null,
            "open_issues_count": 5,
            "forks": 102,
            "open_issues": 5,
            "watchers": 203,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/pulls/87"
          },
          "html": {
            "href": "https://github.com/jlaffaye/ftp/pull/87"
          },
          "issue": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/issues/87"
          },
          "comments": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/issues/87/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/pulls/87/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/pulls/87/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/jlaffaye/ftp/statuses/58864d889b55b7cf44ecc6fff245d4113cbe19e1"
          }
        }
      }
    },
    "public": true,
    "created_at": "2017-05-02T02:39:51Z"
  },
  {
    "id": "5790650453",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 1712708,
      "name": "jlaffaye/ftp",
      "url": "https://api.github.com/repos/jlaffaye/ftp"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/jlaffaye/ftp/issues/87",
        "repository_url": "https://api.github.com/repos/jlaffaye/ftp",
        "labels_url": "https://api.github.com/repos/jlaffaye/ftp/issues/87/labels{/name}",
        "comments_url": "https://api.github.com/repos/jlaffaye/ftp/issues/87/comments",
        "events_url": "https://api.github.com/repos/jlaffaye/ftp/issues/87/events",
        "html_url": "https://github.com/jlaffaye/ftp/pull/87",
        "id": 225567132,
        "number": 87,
        "title": "Avoid forever lock",
        "user": {
          "login": "DAddYE",
          "id": 6537,
          "avatar_url": "https://avatars0.githubusercontent.com/u/6537?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/DAddYE",
          "html_url": "https://github.com/DAddYE",
          "followers_url": "https://api.github.com/users/DAddYE/followers",
          "following_url": "https://api.github.com/users/DAddYE/following{/other_user}",
          "gists_url": "https://api.github.com/users/DAddYE/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/DAddYE/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/DAddYE/subscriptions",
          "organizations_url": "https://api.github.com/users/DAddYE/orgs",
          "repos_url": "https://api.github.com/users/DAddYE/repos",
          "events_url": "https://api.github.com/users/DAddYE/events{/privacy}",
          "received_events_url": "https://api.github.com/users/DAddYE/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 0,
        "created_at": "2017-05-02T01:19:01Z",
        "updated_at": "2017-05-02T01:34:50Z",
        "closed_at": null,
        "pull_request": {
          "url": "https://api.github.com/repos/jlaffaye/ftp/pulls/87",
          "html_url": "https://github.com/jlaffaye/ftp/pull/87",
          "diff_url": "https://github.com/jlaffaye/ftp/pull/87.diff",
          "patch_url": "https://github.com/jlaffaye/ftp/pull/87.patch"
        },
        "body": "If we close the connection two times the second time will hang forever waiting for a server code."
      },
      "comment": {
        "url": "https://api.github.com/repos/jlaffaye/ftp/issues/comments/298476028",
        "html_url": "https://github.com/jlaffaye/ftp/pull/87#issuecomment-298476028",
        "issue_url": "https://api.github.com/repos/jlaffaye/ftp/issues/87",
        "id": 298476028,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-02T01:34:50Z",
        "updated_at": "2017-05-02T01:34:50Z",
        "body": "This largely reverts #6 though.\r\n\r\nAn alternative solution to consider could be to add a ` + "`" + `connClosed bool` + "`" + ` field to ` + "`" + `Response` + "`" + ` struct, to track whether a ` + "`" + `Response` + "`" + ` has been closed already, or something like that."
      }
    },
    "public": true,
    "created_at": "2017-05-02T01:34:50Z"
  },
  {
    "id": "5790422594",
    "type": "DeleteEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "ref": "add-import-comments",
      "ref_type": "branch",
      "pusher_type": "user"
    },
    "public": true,
    "created_at": "2017-05-02T00:28:17Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5790422413",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "push_id": 1713336508,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "ee0644b7c5650555db3c0f4d04f9ef5716e6c6ac",
      "before": "8f445c5dda51d20ef8d05aa5b148cf13122fd4ac",
      "commits": [
        {
          "sha": "ee0644b7c5650555db3c0f4d04f9ef5716e6c6ac",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Add import comments. (#61)\n\nThe repository has been recently renamed from \"examples\" to \"example\"\r\nin #58. Help make the new expected import path more clear by adding\r\nimport comments. (Reference: https://golang.org/cmd/go/#hdr-Import_path_checking.)\r\n\r\nThis way, the expected import path is visible in the source code, in\r\naddition to README. It also gives a better error message when trying\r\nto go get or go install the package with incorrect old import path.\r\n\r\nCloses #58 (again).",
          "distinct": true,
          "url": "https://api.github.com/repos/go-gl/example/commits/ee0644b7c5650555db3c0f4d04f9ef5716e6c6ac"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-02T00:28:14Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5790422367",
    "type": "PullRequestEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "action": "closed",
      "number": 61,
      "pull_request": {
        "url": "https://api.github.com/repos/go-gl/example/pulls/61",
        "id": 118458859,
        "html_url": "https://github.com/go-gl/example/pull/61",
        "diff_url": "https://github.com/go-gl/example/pull/61.diff",
        "patch_url": "https://github.com/go-gl/example/pull/61.patch",
        "issue_url": "https://api.github.com/repos/go-gl/example/issues/61",
        "number": 61,
        "state": "closed",
        "locked": false,
        "title": "Add import comments.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "The repository has been recently renamed from \"examples\" to \"example\" in #58. Help make the new expected import path more clear by adding import comments. (Reference: https://golang.org/cmd/go/#hdr-Import_path_checking.)\r\n\r\nThis way, the expected import path is visible in the source code, in addition to README. It also gives a better error message when trying to ` + "`" + `go get` + "`" + ` or ` + "`" + `go install` + "`" + ` the package with incorrect old import path.\r\n\r\nCloses #58 (again).",
        "created_at": "2017-05-01T23:14:24Z",
        "updated_at": "2017-05-02T00:28:13Z",
        "closed_at": "2017-05-02T00:28:13Z",
        "merged_at": "2017-05-02T00:28:13Z",
        "merge_commit_sha": "ee0644b7c5650555db3c0f4d04f9ef5716e6c6ac",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/go-gl/example/pulls/61/commits",
        "review_comments_url": "https://api.github.com/repos/go-gl/example/pulls/61/comments",
        "review_comment_url": "https://api.github.com/repos/go-gl/example/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/go-gl/example/issues/61/comments",
        "statuses_url": "https://api.github.com/repos/go-gl/example/statuses/3386b6a857e5de0ed4fa15a9cbb2d94a576a11fc",
        "head": {
          "label": "go-gl:add-import-comments",
          "ref": "add-import-comments",
          "sha": "3386b6a857e5de0ed4fa15a9cbb2d94a576a11fc",
          "user": {
            "login": "go-gl",
            "id": 2505184,
            "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/go-gl",
            "html_url": "https://github.com/go-gl",
            "followers_url": "https://api.github.com/users/go-gl/followers",
            "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
            "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
            "organizations_url": "https://api.github.com/users/go-gl/orgs",
            "repos_url": "https://api.github.com/users/go-gl/repos",
            "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
            "received_events_url": "https://api.github.com/users/go-gl/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 6132629,
            "name": "example",
            "full_name": "go-gl/example",
            "owner": {
              "login": "go-gl",
              "id": 2505184,
              "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/go-gl",
              "html_url": "https://github.com/go-gl",
              "followers_url": "https://api.github.com/users/go-gl/followers",
              "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
              "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
              "organizations_url": "https://api.github.com/users/go-gl/orgs",
              "repos_url": "https://api.github.com/users/go-gl/repos",
              "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
              "received_events_url": "https://api.github.com/users/go-gl/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/go-gl/example",
            "description": "Example programs for the various go-gl packages.",
            "fork": false,
            "url": "https://api.github.com/repos/go-gl/example",
            "forks_url": "https://api.github.com/repos/go-gl/example/forks",
            "keys_url": "https://api.github.com/repos/go-gl/example/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/go-gl/example/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/go-gl/example/teams",
            "hooks_url": "https://api.github.com/repos/go-gl/example/hooks",
            "issue_events_url": "https://api.github.com/repos/go-gl/example/issues/events{/number}",
            "events_url": "https://api.github.com/repos/go-gl/example/events",
            "assignees_url": "https://api.github.com/repos/go-gl/example/assignees{/user}",
            "branches_url": "https://api.github.com/repos/go-gl/example/branches{/branch}",
            "tags_url": "https://api.github.com/repos/go-gl/example/tags",
            "blobs_url": "https://api.github.com/repos/go-gl/example/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/go-gl/example/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/go-gl/example/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/go-gl/example/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/go-gl/example/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/go-gl/example/languages",
            "stargazers_url": "https://api.github.com/repos/go-gl/example/stargazers",
            "contributors_url": "https://api.github.com/repos/go-gl/example/contributors",
            "subscribers_url": "https://api.github.com/repos/go-gl/example/subscribers",
            "subscription_url": "https://api.github.com/repos/go-gl/example/subscription",
            "commits_url": "https://api.github.com/repos/go-gl/example/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/go-gl/example/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/go-gl/example/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/go-gl/example/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/go-gl/example/contents/{+path}",
            "compare_url": "https://api.github.com/repos/go-gl/example/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/go-gl/example/merges",
            "archive_url": "https://api.github.com/repos/go-gl/example/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/go-gl/example/downloads",
            "issues_url": "https://api.github.com/repos/go-gl/example/issues{/number}",
            "pulls_url": "https://api.github.com/repos/go-gl/example/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/go-gl/example/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/go-gl/example/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/go-gl/example/labels{/name}",
            "releases_url": "https://api.github.com/repos/go-gl/example/releases{/id}",
            "deployments_url": "https://api.github.com/repos/go-gl/example/deployments",
            "created_at": "2012-10-08T23:08:04Z",
            "updated_at": "2017-05-01T19:35:57Z",
            "pushed_at": "2017-05-02T00:28:13Z",
            "git_url": "git://github.com/go-gl/example.git",
            "ssh_url": "git@github.com:go-gl/example.git",
            "clone_url": "https://github.com/go-gl/example.git",
            "svn_url": "https://github.com/go-gl/example",
            "homepage": null,
            "size": 3199,
            "stargazers_count": 104,
            "watchers_count": 104,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 32,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 32,
            "open_issues": 0,
            "watchers": 104,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "go-gl:master",
          "ref": "master",
          "sha": "8f445c5dda51d20ef8d05aa5b148cf13122fd4ac",
          "user": {
            "login": "go-gl",
            "id": 2505184,
            "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/go-gl",
            "html_url": "https://github.com/go-gl",
            "followers_url": "https://api.github.com/users/go-gl/followers",
            "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
            "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
            "organizations_url": "https://api.github.com/users/go-gl/orgs",
            "repos_url": "https://api.github.com/users/go-gl/repos",
            "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
            "received_events_url": "https://api.github.com/users/go-gl/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 6132629,
            "name": "example",
            "full_name": "go-gl/example",
            "owner": {
              "login": "go-gl",
              "id": 2505184,
              "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/go-gl",
              "html_url": "https://github.com/go-gl",
              "followers_url": "https://api.github.com/users/go-gl/followers",
              "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
              "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
              "organizations_url": "https://api.github.com/users/go-gl/orgs",
              "repos_url": "https://api.github.com/users/go-gl/repos",
              "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
              "received_events_url": "https://api.github.com/users/go-gl/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/go-gl/example",
            "description": "Example programs for the various go-gl packages.",
            "fork": false,
            "url": "https://api.github.com/repos/go-gl/example",
            "forks_url": "https://api.github.com/repos/go-gl/example/forks",
            "keys_url": "https://api.github.com/repos/go-gl/example/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/go-gl/example/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/go-gl/example/teams",
            "hooks_url": "https://api.github.com/repos/go-gl/example/hooks",
            "issue_events_url": "https://api.github.com/repos/go-gl/example/issues/events{/number}",
            "events_url": "https://api.github.com/repos/go-gl/example/events",
            "assignees_url": "https://api.github.com/repos/go-gl/example/assignees{/user}",
            "branches_url": "https://api.github.com/repos/go-gl/example/branches{/branch}",
            "tags_url": "https://api.github.com/repos/go-gl/example/tags",
            "blobs_url": "https://api.github.com/repos/go-gl/example/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/go-gl/example/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/go-gl/example/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/go-gl/example/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/go-gl/example/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/go-gl/example/languages",
            "stargazers_url": "https://api.github.com/repos/go-gl/example/stargazers",
            "contributors_url": "https://api.github.com/repos/go-gl/example/contributors",
            "subscribers_url": "https://api.github.com/repos/go-gl/example/subscribers",
            "subscription_url": "https://api.github.com/repos/go-gl/example/subscription",
            "commits_url": "https://api.github.com/repos/go-gl/example/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/go-gl/example/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/go-gl/example/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/go-gl/example/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/go-gl/example/contents/{+path}",
            "compare_url": "https://api.github.com/repos/go-gl/example/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/go-gl/example/merges",
            "archive_url": "https://api.github.com/repos/go-gl/example/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/go-gl/example/downloads",
            "issues_url": "https://api.github.com/repos/go-gl/example/issues{/number}",
            "pulls_url": "https://api.github.com/repos/go-gl/example/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/go-gl/example/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/go-gl/example/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/go-gl/example/labels{/name}",
            "releases_url": "https://api.github.com/repos/go-gl/example/releases{/id}",
            "deployments_url": "https://api.github.com/repos/go-gl/example/deployments",
            "created_at": "2012-10-08T23:08:04Z",
            "updated_at": "2017-05-01T19:35:57Z",
            "pushed_at": "2017-05-02T00:28:13Z",
            "git_url": "git://github.com/go-gl/example.git",
            "ssh_url": "git@github.com:go-gl/example.git",
            "clone_url": "https://github.com/go-gl/example.git",
            "svn_url": "https://github.com/go-gl/example",
            "homepage": null,
            "size": 3199,
            "stargazers_count": 104,
            "watchers_count": 104,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 32,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 32,
            "open_issues": 0,
            "watchers": 104,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/go-gl/example/pulls/61"
          },
          "html": {
            "href": "https://github.com/go-gl/example/pull/61"
          },
          "issue": {
            "href": "https://api.github.com/repos/go-gl/example/issues/61"
          },
          "comments": {
            "href": "https://api.github.com/repos/go-gl/example/issues/61/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/go-gl/example/pulls/61/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/go-gl/example/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/go-gl/example/pulls/61/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/go-gl/example/statuses/3386b6a857e5de0ed4fa15a9cbb2d94a576a11fc"
          }
        },
        "merged": true,
        "mergeable": null,
        "rebaseable": null,
        "mergeable_state": "unknown",
        "merged_by": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "comments": 0,
        "review_comments": 0,
        "maintainer_can_modify": false,
        "commits": 1,
        "additions": 2,
        "deletions": 2,
        "changed_files": 2
      }
    },
    "public": true,
    "created_at": "2017-05-02T00:28:13Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5790422364",
    "type": "IssuesEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "action": "closed",
      "issue": {
        "url": "https://api.github.com/repos/go-gl/example/issues/58",
        "repository_url": "https://api.github.com/repos/go-gl/example",
        "labels_url": "https://api.github.com/repos/go-gl/example/issues/58/labels{/name}",
        "comments_url": "https://api.github.com/repos/go-gl/example/issues/58/comments",
        "events_url": "https://api.github.com/repos/go-gl/example/issues/58/events",
        "html_url": "https://github.com/go-gl/example/issues/58",
        "id": 225494258,
        "number": 58,
        "title": "Proposal: Rename repository to \"example\".",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "closed",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 6,
        "created_at": "2017-05-01T18:41:11Z",
        "updated_at": "2017-05-02T00:28:13Z",
        "closed_at": "2017-05-02T00:28:13Z",
        "body": "This repo contains examples of usage, and I'd like it to set the best possible example.\r\n\r\nYet the repo's name is deviating slightly from idiomatic Go naming patterns. It should be singular \"example\" rather than \"examples\", so that the import path \"example/name-of-example\" reads more cleanly, and for consistency.\r\n\r\nSee https://dmitri.shuralyov.com/idiomatic-go#use-singular-form-for-collection-repo-folder-name for rationale.\r\n\r\nIf there are no objections, I'd like to rename it to follow idiomatic Go style and set a better example. GitHub will setup redirects from old repo name, so it should be fairly harmless.\r\n\r\n/cc @tapir @slimsag"
      }
    },
    "public": true,
    "created_at": "2017-05-02T00:28:13Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5790183745",
    "type": "IssuesEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 79954708,
      "name": "dominikh/go-tools",
      "url": "https://api.github.com/repos/dominikh/go-tools"
    },
    "payload": {
      "action": "opened",
      "issue": {
        "url": "https://api.github.com/repos/dominikh/go-tools/issues/92",
        "repository_url": "https://api.github.com/repos/dominikh/go-tools",
        "labels_url": "https://api.github.com/repos/dominikh/go-tools/issues/92/labels{/name}",
        "comments_url": "https://api.github.com/repos/dominikh/go-tools/issues/92/comments",
        "events_url": "https://api.github.com/repos/dominikh/go-tools/issues/92/events",
        "html_url": "https://github.com/dominikh/go-tools/issues/92",
        "id": 225553291,
        "number": 92,
        "title": "Import(\".\", d, m) -> ImportDir(d, m) for go/build.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 0,
        "created_at": "2017-05-01T23:28:04Z",
        "updated_at": "2017-05-01T23:28:04Z",
        "closed_at": null,
        "body": "Depending on the outcome of #91, here's another similar potential check, expressed in ` + "`" + `gofmt -r` + "`" + ` syntax:\r\n\r\n` + "```" + `\r\nImport(\".\", d, m) -> ImportDir(d, m)\r\n` + "```" + `\r\n\r\nIt should apply to ` + "`" + `go/build.Import` + "`" + ` and ` + "`" + `go/build.Context.Import` + "`" + ` calls where first ` + "`" + `path` + "`" + ` argument is known to be have \".\" value."
      }
    },
    "public": true,
    "created_at": "2017-05-01T23:28:04Z"
  },
  {
    "id": "5790129441",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "push_id": 1713249284,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/add-import-comments",
      "head": "3386b6a857e5de0ed4fa15a9cbb2d94a576a11fc",
      "before": "fbfd5884be1bc0516f4889aa514bb03c7a5ca123",
      "commits": [
        {
          "sha": "3386b6a857e5de0ed4fa15a9cbb2d94a576a11fc",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Add import comments.\n\nThe repository has been recently renamed from \"examples\" to \"example\"\nin #58. Help make the new expected import path more clear by adding\nimport comments. (Reference: https://golang.org/cmd/go/#hdr-Import_path_checking.)\n\nThis way, the expected import path is visible in the source code, in\naddition to README. It also gives a better error message when trying\nto go get or go install the package with incorrect old import path.\n\nCloses #58 (again).",
          "distinct": true,
          "url": "https://api.github.com/repos/go-gl/example/commits/3386b6a857e5de0ed4fa15a9cbb2d94a576a11fc"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-01T23:14:57Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5790127194",
    "type": "PullRequestEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "action": "opened",
      "number": 61,
      "pull_request": {
        "url": "https://api.github.com/repos/go-gl/example/pulls/61",
        "id": 118458859,
        "html_url": "https://github.com/go-gl/example/pull/61",
        "diff_url": "https://github.com/go-gl/example/pull/61.diff",
        "patch_url": "https://github.com/go-gl/example/pull/61.patch",
        "issue_url": "https://api.github.com/repos/go-gl/example/issues/61",
        "number": 61,
        "state": "open",
        "locked": false,
        "title": "Add import comments.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "The repository has been recently renamed from \"examples\" to \"example\" in #58. Help make the new expected import path more clear by adding import comments. (Reference: https://golang.org/cmd/go/#hdr-Import_path_checking.)\r\n\r\nThis way, the expected import path is visible in the source code, in addition to README. It also gives a better error message when trying to ` + "`" + `go get` + "`" + ` or ` + "`" + `go install` + "`" + ` the package with incorrect old import path.\r\n\r\nCloses #58 (again).",
        "created_at": "2017-05-01T23:14:24Z",
        "updated_at": "2017-05-01T23:14:24Z",
        "closed_at": null,
        "merged_at": null,
        "merge_commit_sha": null,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/go-gl/example/pulls/61/commits",
        "review_comments_url": "https://api.github.com/repos/go-gl/example/pulls/61/comments",
        "review_comment_url": "https://api.github.com/repos/go-gl/example/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/go-gl/example/issues/61/comments",
        "statuses_url": "https://api.github.com/repos/go-gl/example/statuses/fbfd5884be1bc0516f4889aa514bb03c7a5ca123",
        "head": {
          "label": "go-gl:add-import-comments",
          "ref": "add-import-comments",
          "sha": "fbfd5884be1bc0516f4889aa514bb03c7a5ca123",
          "user": {
            "login": "go-gl",
            "id": 2505184,
            "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/go-gl",
            "html_url": "https://github.com/go-gl",
            "followers_url": "https://api.github.com/users/go-gl/followers",
            "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
            "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
            "organizations_url": "https://api.github.com/users/go-gl/orgs",
            "repos_url": "https://api.github.com/users/go-gl/repos",
            "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
            "received_events_url": "https://api.github.com/users/go-gl/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 6132629,
            "name": "example",
            "full_name": "go-gl/example",
            "owner": {
              "login": "go-gl",
              "id": 2505184,
              "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/go-gl",
              "html_url": "https://github.com/go-gl",
              "followers_url": "https://api.github.com/users/go-gl/followers",
              "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
              "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
              "organizations_url": "https://api.github.com/users/go-gl/orgs",
              "repos_url": "https://api.github.com/users/go-gl/repos",
              "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
              "received_events_url": "https://api.github.com/users/go-gl/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/go-gl/example",
            "description": "Example programs for the various go-gl packages.",
            "fork": false,
            "url": "https://api.github.com/repos/go-gl/example",
            "forks_url": "https://api.github.com/repos/go-gl/example/forks",
            "keys_url": "https://api.github.com/repos/go-gl/example/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/go-gl/example/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/go-gl/example/teams",
            "hooks_url": "https://api.github.com/repos/go-gl/example/hooks",
            "issue_events_url": "https://api.github.com/repos/go-gl/example/issues/events{/number}",
            "events_url": "https://api.github.com/repos/go-gl/example/events",
            "assignees_url": "https://api.github.com/repos/go-gl/example/assignees{/user}",
            "branches_url": "https://api.github.com/repos/go-gl/example/branches{/branch}",
            "tags_url": "https://api.github.com/repos/go-gl/example/tags",
            "blobs_url": "https://api.github.com/repos/go-gl/example/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/go-gl/example/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/go-gl/example/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/go-gl/example/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/go-gl/example/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/go-gl/example/languages",
            "stargazers_url": "https://api.github.com/repos/go-gl/example/stargazers",
            "contributors_url": "https://api.github.com/repos/go-gl/example/contributors",
            "subscribers_url": "https://api.github.com/repos/go-gl/example/subscribers",
            "subscription_url": "https://api.github.com/repos/go-gl/example/subscription",
            "commits_url": "https://api.github.com/repos/go-gl/example/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/go-gl/example/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/go-gl/example/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/go-gl/example/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/go-gl/example/contents/{+path}",
            "compare_url": "https://api.github.com/repos/go-gl/example/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/go-gl/example/merges",
            "archive_url": "https://api.github.com/repos/go-gl/example/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/go-gl/example/downloads",
            "issues_url": "https://api.github.com/repos/go-gl/example/issues{/number}",
            "pulls_url": "https://api.github.com/repos/go-gl/example/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/go-gl/example/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/go-gl/example/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/go-gl/example/labels{/name}",
            "releases_url": "https://api.github.com/repos/go-gl/example/releases{/id}",
            "deployments_url": "https://api.github.com/repos/go-gl/example/deployments",
            "created_at": "2012-10-08T23:08:04Z",
            "updated_at": "2017-05-01T19:35:57Z",
            "pushed_at": "2017-05-01T23:13:02Z",
            "git_url": "git://github.com/go-gl/example.git",
            "ssh_url": "git@github.com:go-gl/example.git",
            "clone_url": "https://github.com/go-gl/example.git",
            "svn_url": "https://github.com/go-gl/example",
            "homepage": null,
            "size": 3198,
            "stargazers_count": 104,
            "watchers_count": 104,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 32,
            "mirror_url": null,
            "open_issues_count": 2,
            "forks": 32,
            "open_issues": 2,
            "watchers": 104,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "go-gl:master",
          "ref": "master",
          "sha": "8f445c5dda51d20ef8d05aa5b148cf13122fd4ac",
          "user": {
            "login": "go-gl",
            "id": 2505184,
            "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/go-gl",
            "html_url": "https://github.com/go-gl",
            "followers_url": "https://api.github.com/users/go-gl/followers",
            "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
            "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
            "organizations_url": "https://api.github.com/users/go-gl/orgs",
            "repos_url": "https://api.github.com/users/go-gl/repos",
            "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
            "received_events_url": "https://api.github.com/users/go-gl/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 6132629,
            "name": "example",
            "full_name": "go-gl/example",
            "owner": {
              "login": "go-gl",
              "id": 2505184,
              "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/go-gl",
              "html_url": "https://github.com/go-gl",
              "followers_url": "https://api.github.com/users/go-gl/followers",
              "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
              "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
              "organizations_url": "https://api.github.com/users/go-gl/orgs",
              "repos_url": "https://api.github.com/users/go-gl/repos",
              "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
              "received_events_url": "https://api.github.com/users/go-gl/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/go-gl/example",
            "description": "Example programs for the various go-gl packages.",
            "fork": false,
            "url": "https://api.github.com/repos/go-gl/example",
            "forks_url": "https://api.github.com/repos/go-gl/example/forks",
            "keys_url": "https://api.github.com/repos/go-gl/example/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/go-gl/example/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/go-gl/example/teams",
            "hooks_url": "https://api.github.com/repos/go-gl/example/hooks",
            "issue_events_url": "https://api.github.com/repos/go-gl/example/issues/events{/number}",
            "events_url": "https://api.github.com/repos/go-gl/example/events",
            "assignees_url": "https://api.github.com/repos/go-gl/example/assignees{/user}",
            "branches_url": "https://api.github.com/repos/go-gl/example/branches{/branch}",
            "tags_url": "https://api.github.com/repos/go-gl/example/tags",
            "blobs_url": "https://api.github.com/repos/go-gl/example/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/go-gl/example/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/go-gl/example/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/go-gl/example/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/go-gl/example/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/go-gl/example/languages",
            "stargazers_url": "https://api.github.com/repos/go-gl/example/stargazers",
            "contributors_url": "https://api.github.com/repos/go-gl/example/contributors",
            "subscribers_url": "https://api.github.com/repos/go-gl/example/subscribers",
            "subscription_url": "https://api.github.com/repos/go-gl/example/subscription",
            "commits_url": "https://api.github.com/repos/go-gl/example/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/go-gl/example/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/go-gl/example/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/go-gl/example/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/go-gl/example/contents/{+path}",
            "compare_url": "https://api.github.com/repos/go-gl/example/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/go-gl/example/merges",
            "archive_url": "https://api.github.com/repos/go-gl/example/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/go-gl/example/downloads",
            "issues_url": "https://api.github.com/repos/go-gl/example/issues{/number}",
            "pulls_url": "https://api.github.com/repos/go-gl/example/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/go-gl/example/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/go-gl/example/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/go-gl/example/labels{/name}",
            "releases_url": "https://api.github.com/repos/go-gl/example/releases{/id}",
            "deployments_url": "https://api.github.com/repos/go-gl/example/deployments",
            "created_at": "2012-10-08T23:08:04Z",
            "updated_at": "2017-05-01T19:35:57Z",
            "pushed_at": "2017-05-01T23:13:02Z",
            "git_url": "git://github.com/go-gl/example.git",
            "ssh_url": "git@github.com:go-gl/example.git",
            "clone_url": "https://github.com/go-gl/example.git",
            "svn_url": "https://github.com/go-gl/example",
            "homepage": null,
            "size": 3198,
            "stargazers_count": 104,
            "watchers_count": 104,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 32,
            "mirror_url": null,
            "open_issues_count": 2,
            "forks": 32,
            "open_issues": 2,
            "watchers": 104,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/go-gl/example/pulls/61"
          },
          "html": {
            "href": "https://github.com/go-gl/example/pull/61"
          },
          "issue": {
            "href": "https://api.github.com/repos/go-gl/example/issues/61"
          },
          "comments": {
            "href": "https://api.github.com/repos/go-gl/example/issues/61/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/go-gl/example/pulls/61/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/go-gl/example/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/go-gl/example/pulls/61/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/go-gl/example/statuses/fbfd5884be1bc0516f4889aa514bb03c7a5ca123"
          }
        },
        "merged": false,
        "mergeable": null,
        "rebaseable": null,
        "mergeable_state": "unknown",
        "merged_by": null,
        "comments": 0,
        "review_comments": 0,
        "maintainer_can_modify": false,
        "commits": 1,
        "additions": 2,
        "deletions": 2,
        "changed_files": 2
      }
    },
    "public": true,
    "created_at": "2017-05-01T23:14:24Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5790121425",
    "type": "CreateEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "ref": "add-import-comments",
      "ref_type": "branch",
      "master_branch": "master",
      "description": "Example programs for the various go-gl packages.",
      "pusher_type": "user"
    },
    "public": true,
    "created_at": "2017-05-01T23:13:02Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5789984419",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/go-gl/example/issues/58",
        "repository_url": "https://api.github.com/repos/go-gl/example",
        "labels_url": "https://api.github.com/repos/go-gl/example/issues/58/labels{/name}",
        "comments_url": "https://api.github.com/repos/go-gl/example/issues/58/comments",
        "events_url": "https://api.github.com/repos/go-gl/example/issues/58/events",
        "html_url": "https://github.com/go-gl/example/issues/58",
        "id": 225494258,
        "number": 58,
        "title": "Proposal: Rename repository to \"example\".",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 4,
        "created_at": "2017-05-01T18:41:11Z",
        "updated_at": "2017-05-01T22:43:08Z",
        "closed_at": null,
        "body": "This repo contains examples of usage, and I'd like it to set the best possible example.\r\n\r\nYet the repo's name is deviating slightly from idiomatic Go naming patterns. It should be singular \"example\" rather than \"examples\", so that the import path \"example/name-of-example\" reads more cleanly, and for consistency.\r\n\r\nSee https://dmitri.shuralyov.com/idiomatic-go#use-singular-form-for-collection-repo-folder-name for rationale.\r\n\r\nIf there are no objections, I'd like to rename it to follow idiomatic Go style and set a better example. GitHub will setup redirects from old repo name, so it should be fairly harmless.\r\n\r\n/cc @tapir @slimsag"
      },
      "comment": {
        "url": "https://api.github.com/repos/go-gl/example/issues/comments/298452235",
        "html_url": "https://github.com/go-gl/example/issues/58#issuecomment-298452235",
        "issue_url": "https://api.github.com/repos/go-gl/example/issues/58",
        "id": 298452235,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-01T22:43:08Z",
        "updated_at": "2017-05-01T22:43:08Z",
        "body": "> In effect, we're still supporting both import paths, which IMO is bad.\r\n\r\nI don't see that as us supporting both import paths. The old one just happens to work with ` + "`" + `go get` + "`" + `, but it's not actually supported by us. The actual program won't work, you'll get an error:\r\n\r\n` + "```" + `\r\n2017/05/01 18:41:20 Unable to find Go package in your GOPATH, it's needed to load assets: cannot find package \"github.com/go-gl/example/gl41core-cube\" in any of:\r\n\t/usr/local/go/src/github.com/go-gl/example/gl41core-cube (from $GOROOT)\r\n\t/tmp/gopath/src/github.com/go-gl/example/gl41core-cube (from $GOPATH)\r\n` + "```" + `\r\n\r\nBut, I'm okay with adding import path comments, then the error will happen at ` + "`" + `go get` + "`" + ` time and maybe it's more clear."
      }
    },
    "public": true,
    "created_at": "2017-05-01T22:43:08Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5789872753",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 23096959,
      "name": "golang/go",
      "url": "https://api.github.com/repos/golang/go"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/golang/go/issues/20175",
        "repository_url": "https://api.github.com/repos/golang/go",
        "labels_url": "https://api.github.com/repos/golang/go/issues/20175/labels{/name}",
        "comments_url": "https://api.github.com/repos/golang/go/issues/20175/comments",
        "events_url": "https://api.github.com/repos/golang/go/issues/20175/events",
        "html_url": "https://github.com/golang/go/issues/20175",
        "id": 225280142,
        "number": 20175,
        "title": "cmd/go: regression in \"go get\" with relative paths",
        "user": {
          "login": "kevinburke",
          "id": 234019,
          "avatar_url": "https://avatars2.githubusercontent.com/u/234019?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/kevinburke",
          "html_url": "https://github.com/kevinburke",
          "followers_url": "https://api.github.com/users/kevinburke/followers",
          "following_url": "https://api.github.com/users/kevinburke/following{/other_user}",
          "gists_url": "https://api.github.com/users/kevinburke/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/kevinburke/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/kevinburke/subscriptions",
          "organizations_url": "https://api.github.com/users/kevinburke/orgs",
          "repos_url": "https://api.github.com/users/kevinburke/repos",
          "events_url": "https://api.github.com/users/kevinburke/events{/privacy}",
          "received_events_url": "https://api.github.com/users/kevinburke/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [
          {
            "id": 373402289,
            "url": "https://api.github.com/repos/golang/go/labels/NeedsInvestigation",
            "name": "NeedsInvestigation",
            "color": "ededed",
            "default": false
          }
        ],
        "state": "open",
        "locked": false,
        "assignee": {
          "login": "rsc",
          "id": 104030,
          "avatar_url": "https://avatars2.githubusercontent.com/u/104030?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/rsc",
          "html_url": "https://github.com/rsc",
          "followers_url": "https://api.github.com/users/rsc/followers",
          "following_url": "https://api.github.com/users/rsc/following{/other_user}",
          "gists_url": "https://api.github.com/users/rsc/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/rsc/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/rsc/subscriptions",
          "organizations_url": "https://api.github.com/users/rsc/orgs",
          "repos_url": "https://api.github.com/users/rsc/repos",
          "events_url": "https://api.github.com/users/rsc/events{/privacy}",
          "received_events_url": "https://api.github.com/users/rsc/received_events",
          "type": "User",
          "site_admin": false
        },
        "assignees": [
          {
            "login": "rsc",
            "id": 104030,
            "avatar_url": "https://avatars2.githubusercontent.com/u/104030?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/rsc",
            "html_url": "https://github.com/rsc",
            "followers_url": "https://api.github.com/users/rsc/followers",
            "following_url": "https://api.github.com/users/rsc/following{/other_user}",
            "gists_url": "https://api.github.com/users/rsc/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/rsc/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/rsc/subscriptions",
            "organizations_url": "https://api.github.com/users/rsc/orgs",
            "repos_url": "https://api.github.com/users/rsc/repos",
            "events_url": "https://api.github.com/users/rsc/events{/privacy}",
            "received_events_url": "https://api.github.com/users/rsc/received_events",
            "type": "User",
            "site_admin": false
          },
          {
            "login": "shurcooL",
            "id": 1924134,
            "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/shurcooL",
            "html_url": "https://github.com/shurcooL",
            "followers_url": "https://api.github.com/users/shurcooL/followers",
            "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
            "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
            "organizations_url": "https://api.github.com/users/shurcooL/orgs",
            "repos_url": "https://api.github.com/users/shurcooL/repos",
            "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
            "received_events_url": "https://api.github.com/users/shurcooL/received_events",
            "type": "User",
            "site_admin": false
          }
        ],
        "milestone": {
          "url": "https://api.github.com/repos/golang/go/milestones/49",
          "html_url": "https://github.com/golang/go/milestone/49",
          "labels_url": "https://api.github.com/repos/golang/go/milestones/49/labels",
          "id": 2053058,
          "number": 49,
          "title": "Go1.9",
          "description": "",
          "creator": {
            "login": "rsc",
            "id": 104030,
            "avatar_url": "https://avatars2.githubusercontent.com/u/104030?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/rsc",
            "html_url": "https://github.com/rsc",
            "followers_url": "https://api.github.com/users/rsc/followers",
            "following_url": "https://api.github.com/users/rsc/following{/other_user}",
            "gists_url": "https://api.github.com/users/rsc/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/rsc/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/rsc/subscriptions",
            "organizations_url": "https://api.github.com/users/rsc/orgs",
            "repos_url": "https://api.github.com/users/rsc/repos",
            "events_url": "https://api.github.com/users/rsc/events{/privacy}",
            "received_events_url": "https://api.github.com/users/rsc/received_events",
            "type": "User",
            "site_admin": false
          },
          "open_issues": 517,
          "closed_issues": 348,
          "state": "open",
          "created_at": "2016-10-06T18:17:55Z",
          "updated_at": "2017-05-01T18:47:21Z",
          "due_on": "2017-07-31T07:00:00Z",
          "closed_at": null
        },
        "comments": 5,
        "created_at": "2017-04-29T19:38:29Z",
        "updated_at": "2017-05-01T22:20:34Z",
        "closed_at": null,
        "body": "Please answer these questions before submitting your issue. Thanks!\r\n\r\n### What version of Go are you using (` + "`" + `go version` + "`" + `)?\r\n\r\nTip (` + "`" + `go version devel +c4335f81a2 Fri Apr 28 23:38:15 2017 +0000 darwin/amd64` + "`" + `)\r\n\r\n### What operating system and processor architecture are you using (` + "`" + `go env` + "`" + `)?\r\n\r\nMac\r\n\r\n### What did you do?\r\n\r\n` + "```" + `\r\nexport GOPATH=/Users/kevin\r\nmkdir -p \"$GOPATH/src/github.com/kevinburke\"\r\npushd \"$GOPATH/src/github.com/kevinburke\"\r\n    rm -rf rest # just to make sure it's empty\r\n    go get ./rest\r\npopd\r\n` + "```" + `\r\n\r\n### What did you expect to see?\r\n\r\nI expected github.com/kevinburke/rest to get cloned from Github and checked out to $GOPATH/src/github.com/kevinburke/rest. (You should be able to reproduce this problem with any relative path, there's nothing specific to this repository)\r\n\r\nThis is the behavior of Go 1.5 through Go 1.8 (didn't test earlier versions than this).\r\n\r\n### What did you see instead?\r\n\r\n` + "```" + `\r\n$ go get ./rest\r\ncan't load package: package ./rest: cannot find package \"./rest\" in:\r\n\t/Users/kevin/src/github.com/kevinburke/rest\r\n` + "```" + `\r\n\r\nMy apologies as I believe someone was working on this previously, but I searched the issue history for related terms and couldn't find anything about it."
      },
      "comment": {
        "url": "https://api.github.com/repos/golang/go/issues/comments/298448161",
        "html_url": "https://github.com/golang/go/issues/20175#issuecomment-298448161",
        "issue_url": "https://api.github.com/repos/golang/go/issues/20175",
        "id": 298448161,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-01T22:20:34Z",
        "updated_at": "2017-05-01T22:20:34Z",
        "body": "> Why not just roll back the incompatible change made for #17863?\r\n\r\nIt's possible to do that, but it seems it would take more steps. That change was made 2 months ago. If rolled back now, it would break ` + "`" + `x/tools/cmd/godoc` + "`" + ` tests. Since it's clear where the problem is, it's possible to fix this issue directly. But I can act differently if advised so.\r\n\r\nThe problem is that ` + "`" + `cmd/go` + "`" + ` relies on previous behavior of ` + "`" + `build.Import` + "`" + ` that was not tested. Specifically:\r\n\r\n` + "```" + `\r\n// If the path is a local import path naming a package that can be imported\r\n// using a standard import path, the returned package will set p.ImportPath\r\n// to that path.\r\n` + "```" + `\r\n\r\nIn combination with:\r\n\r\n` + "```" + `\r\n// If an error occurs, Import returns a non-nil error and a non-nil\r\n// *Package containing partial information.\r\n` + "```" + `\r\n\r\nIn the case of local import path pointing to a directory that doesn't exist, that behavior was broken by the change in [CL 33158](https://golang.org/cl/33158).\r\n\r\nA fix I'm come up with is to bring back that previous behavior of ` + "`" + `build.Import` + "`" + ` and add tests for it. This can be done without re-introducing #17863 issue, so tests for that continue to pass.\r\n\r\nI've sent [CL 42350](https://golang.org/cl/42350), can you comment on how it looks?"
      }
    },
    "public": true,
    "created_at": "2017-05-01T22:20:36Z",
    "org": {
      "id": 4314092,
      "login": "golang",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/golang",
      "avatar_url": "https://avatars.githubusercontent.com/u/4314092?"
    }
  },
  {
    "id": "5788891181",
    "type": "DeleteEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "ref": "rename-repo-example",
      "ref_type": "branch",
      "pusher_type": "user"
    },
    "public": true,
    "created_at": "2017-05-01T19:38:13Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5788891027",
    "type": "PushEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "push_id": 1712887418,
      "size": 1,
      "distinct_size": 1,
      "ref": "refs/heads/master",
      "head": "8f445c5dda51d20ef8d05aa5b148cf13122fd4ac",
      "before": "1d63ea199d3c276e3ff4bd7adc4bc03331b81de4",
      "commits": [
        {
          "sha": "8f445c5dda51d20ef8d05aa5b148cf13122fd4ac",
          "author": {
            "email": "shurcooL@gmail.com",
            "name": "Dmitri Shuralyov"
          },
          "message": "Rename repository to example. (#60)\n\nCloses #58.",
          "distinct": true,
          "url": "https://api.github.com/repos/go-gl/example/commits/8f445c5dda51d20ef8d05aa5b148cf13122fd4ac"
        }
      ]
    },
    "public": true,
    "created_at": "2017-05-01T19:38:12Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5788890958",
    "type": "PullRequestEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "action": "closed",
      "number": 60,
      "pull_request": {
        "url": "https://api.github.com/repos/go-gl/example/pulls/60",
        "id": 118425183,
        "html_url": "https://github.com/go-gl/example/pull/60",
        "diff_url": "https://github.com/go-gl/example/pull/60.diff",
        "patch_url": "https://github.com/go-gl/example/pull/60.patch",
        "issue_url": "https://api.github.com/repos/go-gl/example/issues/60",
        "number": 60,
        "state": "closed",
        "locked": false,
        "title": "Rename repository to example.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "body": "To be merged after the repository has been renamed.\r\n\r\nCloses #58.",
        "created_at": "2017-05-01T19:27:40Z",
        "updated_at": "2017-05-01T19:38:11Z",
        "closed_at": "2017-05-01T19:38:11Z",
        "merged_at": "2017-05-01T19:38:11Z",
        "merge_commit_sha": "8f445c5dda51d20ef8d05aa5b148cf13122fd4ac",
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "commits_url": "https://api.github.com/repos/go-gl/example/pulls/60/commits",
        "review_comments_url": "https://api.github.com/repos/go-gl/example/pulls/60/comments",
        "review_comment_url": "https://api.github.com/repos/go-gl/example/pulls/comments{/number}",
        "comments_url": "https://api.github.com/repos/go-gl/example/issues/60/comments",
        "statuses_url": "https://api.github.com/repos/go-gl/example/statuses/9f765017002f2d5e81e5245e64bea72fad28c32f",
        "head": {
          "label": "go-gl:rename-repo-example",
          "ref": "rename-repo-example",
          "sha": "9f765017002f2d5e81e5245e64bea72fad28c32f",
          "user": {
            "login": "go-gl",
            "id": 2505184,
            "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/go-gl",
            "html_url": "https://github.com/go-gl",
            "followers_url": "https://api.github.com/users/go-gl/followers",
            "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
            "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
            "organizations_url": "https://api.github.com/users/go-gl/orgs",
            "repos_url": "https://api.github.com/users/go-gl/repos",
            "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
            "received_events_url": "https://api.github.com/users/go-gl/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 6132629,
            "name": "example",
            "full_name": "go-gl/example",
            "owner": {
              "login": "go-gl",
              "id": 2505184,
              "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/go-gl",
              "html_url": "https://github.com/go-gl",
              "followers_url": "https://api.github.com/users/go-gl/followers",
              "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
              "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
              "organizations_url": "https://api.github.com/users/go-gl/orgs",
              "repos_url": "https://api.github.com/users/go-gl/repos",
              "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
              "received_events_url": "https://api.github.com/users/go-gl/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/go-gl/example",
            "description": "Example programs for the various go-gl packages.",
            "fork": false,
            "url": "https://api.github.com/repos/go-gl/example",
            "forks_url": "https://api.github.com/repos/go-gl/example/forks",
            "keys_url": "https://api.github.com/repos/go-gl/example/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/go-gl/example/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/go-gl/example/teams",
            "hooks_url": "https://api.github.com/repos/go-gl/example/hooks",
            "issue_events_url": "https://api.github.com/repos/go-gl/example/issues/events{/number}",
            "events_url": "https://api.github.com/repos/go-gl/example/events",
            "assignees_url": "https://api.github.com/repos/go-gl/example/assignees{/user}",
            "branches_url": "https://api.github.com/repos/go-gl/example/branches{/branch}",
            "tags_url": "https://api.github.com/repos/go-gl/example/tags",
            "blobs_url": "https://api.github.com/repos/go-gl/example/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/go-gl/example/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/go-gl/example/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/go-gl/example/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/go-gl/example/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/go-gl/example/languages",
            "stargazers_url": "https://api.github.com/repos/go-gl/example/stargazers",
            "contributors_url": "https://api.github.com/repos/go-gl/example/contributors",
            "subscribers_url": "https://api.github.com/repos/go-gl/example/subscribers",
            "subscription_url": "https://api.github.com/repos/go-gl/example/subscription",
            "commits_url": "https://api.github.com/repos/go-gl/example/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/go-gl/example/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/go-gl/example/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/go-gl/example/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/go-gl/example/contents/{+path}",
            "compare_url": "https://api.github.com/repos/go-gl/example/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/go-gl/example/merges",
            "archive_url": "https://api.github.com/repos/go-gl/example/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/go-gl/example/downloads",
            "issues_url": "https://api.github.com/repos/go-gl/example/issues{/number}",
            "pulls_url": "https://api.github.com/repos/go-gl/example/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/go-gl/example/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/go-gl/example/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/go-gl/example/labels{/name}",
            "releases_url": "https://api.github.com/repos/go-gl/example/releases{/id}",
            "deployments_url": "https://api.github.com/repos/go-gl/example/deployments",
            "created_at": "2012-10-08T23:08:04Z",
            "updated_at": "2017-05-01T19:35:57Z",
            "pushed_at": "2017-05-01T19:38:11Z",
            "git_url": "git://github.com/go-gl/example.git",
            "ssh_url": "git@github.com:go-gl/example.git",
            "clone_url": "https://github.com/go-gl/example.git",
            "svn_url": "https://github.com/go-gl/example",
            "homepage": null,
            "size": 3229,
            "stargazers_count": 104,
            "watchers_count": 104,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 32,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 32,
            "open_issues": 0,
            "watchers": 104,
            "default_branch": "master"
          }
        },
        "base": {
          "label": "go-gl:master",
          "ref": "master",
          "sha": "95da75be83d1bd063052f7d12c4fd5d44ab8df39",
          "user": {
            "login": "go-gl",
            "id": 2505184,
            "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
            "gravatar_id": "",
            "url": "https://api.github.com/users/go-gl",
            "html_url": "https://github.com/go-gl",
            "followers_url": "https://api.github.com/users/go-gl/followers",
            "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
            "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
            "organizations_url": "https://api.github.com/users/go-gl/orgs",
            "repos_url": "https://api.github.com/users/go-gl/repos",
            "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
            "received_events_url": "https://api.github.com/users/go-gl/received_events",
            "type": "Organization",
            "site_admin": false
          },
          "repo": {
            "id": 6132629,
            "name": "example",
            "full_name": "go-gl/example",
            "owner": {
              "login": "go-gl",
              "id": 2505184,
              "avatar_url": "https://avatars0.githubusercontent.com/u/2505184?v=3",
              "gravatar_id": "",
              "url": "https://api.github.com/users/go-gl",
              "html_url": "https://github.com/go-gl",
              "followers_url": "https://api.github.com/users/go-gl/followers",
              "following_url": "https://api.github.com/users/go-gl/following{/other_user}",
              "gists_url": "https://api.github.com/users/go-gl/gists{/gist_id}",
              "starred_url": "https://api.github.com/users/go-gl/starred{/owner}{/repo}",
              "subscriptions_url": "https://api.github.com/users/go-gl/subscriptions",
              "organizations_url": "https://api.github.com/users/go-gl/orgs",
              "repos_url": "https://api.github.com/users/go-gl/repos",
              "events_url": "https://api.github.com/users/go-gl/events{/privacy}",
              "received_events_url": "https://api.github.com/users/go-gl/received_events",
              "type": "Organization",
              "site_admin": false
            },
            "private": false,
            "html_url": "https://github.com/go-gl/example",
            "description": "Example programs for the various go-gl packages.",
            "fork": false,
            "url": "https://api.github.com/repos/go-gl/example",
            "forks_url": "https://api.github.com/repos/go-gl/example/forks",
            "keys_url": "https://api.github.com/repos/go-gl/example/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/go-gl/example/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/go-gl/example/teams",
            "hooks_url": "https://api.github.com/repos/go-gl/example/hooks",
            "issue_events_url": "https://api.github.com/repos/go-gl/example/issues/events{/number}",
            "events_url": "https://api.github.com/repos/go-gl/example/events",
            "assignees_url": "https://api.github.com/repos/go-gl/example/assignees{/user}",
            "branches_url": "https://api.github.com/repos/go-gl/example/branches{/branch}",
            "tags_url": "https://api.github.com/repos/go-gl/example/tags",
            "blobs_url": "https://api.github.com/repos/go-gl/example/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/go-gl/example/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/go-gl/example/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/go-gl/example/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/go-gl/example/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/go-gl/example/languages",
            "stargazers_url": "https://api.github.com/repos/go-gl/example/stargazers",
            "contributors_url": "https://api.github.com/repos/go-gl/example/contributors",
            "subscribers_url": "https://api.github.com/repos/go-gl/example/subscribers",
            "subscription_url": "https://api.github.com/repos/go-gl/example/subscription",
            "commits_url": "https://api.github.com/repos/go-gl/example/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/go-gl/example/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/go-gl/example/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/go-gl/example/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/go-gl/example/contents/{+path}",
            "compare_url": "https://api.github.com/repos/go-gl/example/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/go-gl/example/merges",
            "archive_url": "https://api.github.com/repos/go-gl/example/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/go-gl/example/downloads",
            "issues_url": "https://api.github.com/repos/go-gl/example/issues{/number}",
            "pulls_url": "https://api.github.com/repos/go-gl/example/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/go-gl/example/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/go-gl/example/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/go-gl/example/labels{/name}",
            "releases_url": "https://api.github.com/repos/go-gl/example/releases{/id}",
            "deployments_url": "https://api.github.com/repos/go-gl/example/deployments",
            "created_at": "2012-10-08T23:08:04Z",
            "updated_at": "2017-05-01T19:35:57Z",
            "pushed_at": "2017-05-01T19:38:11Z",
            "git_url": "git://github.com/go-gl/example.git",
            "ssh_url": "git@github.com:go-gl/example.git",
            "clone_url": "https://github.com/go-gl/example.git",
            "svn_url": "https://github.com/go-gl/example",
            "homepage": null,
            "size": 3229,
            "stargazers_count": 104,
            "watchers_count": 104,
            "language": "Go",
            "has_issues": true,
            "has_projects": true,
            "has_downloads": true,
            "has_wiki": false,
            "has_pages": false,
            "forks_count": 32,
            "mirror_url": null,
            "open_issues_count": 0,
            "forks": 32,
            "open_issues": 0,
            "watchers": 104,
            "default_branch": "master"
          }
        },
        "_links": {
          "self": {
            "href": "https://api.github.com/repos/go-gl/example/pulls/60"
          },
          "html": {
            "href": "https://github.com/go-gl/example/pull/60"
          },
          "issue": {
            "href": "https://api.github.com/repos/go-gl/example/issues/60"
          },
          "comments": {
            "href": "https://api.github.com/repos/go-gl/example/issues/60/comments"
          },
          "review_comments": {
            "href": "https://api.github.com/repos/go-gl/example/pulls/60/comments"
          },
          "review_comment": {
            "href": "https://api.github.com/repos/go-gl/example/pulls/comments{/number}"
          },
          "commits": {
            "href": "https://api.github.com/repos/go-gl/example/pulls/60/commits"
          },
          "statuses": {
            "href": "https://api.github.com/repos/go-gl/example/statuses/9f765017002f2d5e81e5245e64bea72fad28c32f"
          }
        },
        "merged": true,
        "mergeable": null,
        "rebaseable": null,
        "mergeable_state": "unknown",
        "merged_by": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "comments": 1,
        "review_comments": 0,
        "maintainer_can_modify": false,
        "commits": 1,
        "additions": 7,
        "deletions": 7,
        "changed_files": 6
      }
    },
    "public": true,
    "created_at": "2017-05-01T19:38:11Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5788890952",
    "type": "IssuesEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "action": "closed",
      "issue": {
        "url": "https://api.github.com/repos/go-gl/example/issues/58",
        "repository_url": "https://api.github.com/repos/go-gl/example",
        "labels_url": "https://api.github.com/repos/go-gl/example/issues/58/labels{/name}",
        "comments_url": "https://api.github.com/repos/go-gl/example/issues/58/comments",
        "events_url": "https://api.github.com/repos/go-gl/example/issues/58/events",
        "html_url": "https://github.com/go-gl/example/issues/58",
        "id": 225494258,
        "number": 58,
        "title": "Proposal: Rename repository to \"example\".",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "closed",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 3,
        "created_at": "2017-05-01T18:41:11Z",
        "updated_at": "2017-05-01T19:38:11Z",
        "closed_at": "2017-05-01T19:38:11Z",
        "body": "This repo contains examples of usage, and I'd like it to set the best possible example.\r\n\r\nYet the repo's name is deviating slightly from idiomatic Go naming patterns. It should be singular \"example\" rather than \"examples\", so that the import path \"example/name-of-example\" reads more cleanly, and for consistency.\r\n\r\nSee https://dmitri.shuralyov.com/idiomatic-go#use-singular-form-for-collection-repo-folder-name for rationale.\r\n\r\nIf there are no objections, I'd like to rename it to follow idiomatic Go style and set a better example. GitHub will setup redirects from old repo name, so it should be fairly harmless.\r\n\r\n/cc @tapir @slimsag"
      }
    },
    "public": true,
    "created_at": "2017-05-01T19:38:11Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  },
  {
    "id": "5788889522",
    "type": "IssueCommentEvent",
    "actor": {
      "id": 1924134,
      "login": "shurcooL",
      "display_login": "shurcooL",
      "gravatar_id": "",
      "url": "https://api.github.com/users/shurcooL",
      "avatar_url": "https://avatars.githubusercontent.com/u/1924134?"
    },
    "repo": {
      "id": 6132629,
      "name": "go-gl/example",
      "url": "https://api.github.com/repos/go-gl/example"
    },
    "payload": {
      "action": "created",
      "issue": {
        "url": "https://api.github.com/repos/go-gl/example/issues/60",
        "repository_url": "https://api.github.com/repos/go-gl/example",
        "labels_url": "https://api.github.com/repos/go-gl/example/issues/60/labels{/name}",
        "comments_url": "https://api.github.com/repos/go-gl/example/issues/60/comments",
        "events_url": "https://api.github.com/repos/go-gl/example/issues/60/events",
        "html_url": "https://github.com/go-gl/example/pull/60",
        "id": 225505242,
        "number": 60,
        "title": "Rename repository to example.",
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "labels": [

        ],
        "state": "open",
        "locked": false,
        "assignee": null,
        "assignees": [

        ],
        "milestone": null,
        "comments": 0,
        "created_at": "2017-05-01T19:27:40Z",
        "updated_at": "2017-05-01T19:37:56Z",
        "closed_at": null,
        "pull_request": {
          "url": "https://api.github.com/repos/go-gl/example/pulls/60",
          "html_url": "https://github.com/go-gl/example/pull/60",
          "diff_url": "https://github.com/go-gl/example/pull/60.diff",
          "patch_url": "https://github.com/go-gl/example/pull/60.patch"
        },
        "body": "To be merged after the repository has been renamed.\r\n\r\nCloses #58."
      },
      "comment": {
        "url": "https://api.github.com/repos/go-gl/example/issues/comments/298412013",
        "html_url": "https://github.com/go-gl/example/pull/60#issuecomment-298412013",
        "issue_url": "https://api.github.com/repos/go-gl/example/issues/60",
        "id": 298412013,
        "user": {
          "login": "shurcooL",
          "id": 1924134,
          "avatar_url": "https://avatars0.githubusercontent.com/u/1924134?v=3",
          "gravatar_id": "",
          "url": "https://api.github.com/users/shurcooL",
          "html_url": "https://github.com/shurcooL",
          "followers_url": "https://api.github.com/users/shurcooL/followers",
          "following_url": "https://api.github.com/users/shurcooL/following{/other_user}",
          "gists_url": "https://api.github.com/users/shurcooL/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/shurcooL/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/shurcooL/subscriptions",
          "organizations_url": "https://api.github.com/users/shurcooL/orgs",
          "repos_url": "https://api.github.com/users/shurcooL/repos",
          "events_url": "https://api.github.com/users/shurcooL/events{/privacy}",
          "received_events_url": "https://api.github.com/users/shurcooL/received_events",
          "type": "User",
          "site_admin": false
        },
        "created_at": "2017-05-01T19:37:56Z",
        "updated_at": "2017-05-01T19:37:56Z",
        "body": "The \"examples\" -> \"example\" repository rename has been done.\r\n\r\nTravis has been refreshed to be aware of the new repo name too.\r\n\r\nMerging this now."
      }
    },
    "public": true,
    "created_at": "2017-05-01T19:37:56Z",
    "org": {
      "id": 2505184,
      "login": "go-gl",
      "gravatar_id": "",
      "url": "https://api.github.com/orgs/go-gl",
      "avatar_url": "https://avatars.githubusercontent.com/u/2505184?"
    }
  }
]`
