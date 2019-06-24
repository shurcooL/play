// Play with creating a simple pubsubhelper client.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"time"
)

func main() {
	int := make(chan os.Signal, 1)
	signal.Notify(int, os.Interrupt)
	ctx, cancel := context.WithCancel(context.Background())
	go func() { <-int; cancel() }()

	err := run(ctx)
	if err != nil {
		log.Fatalln(err)
	}
}

func run(ctx context.Context) error {
	var c Client
	ch := make(chan Event)
	c.StreamEvents(ctx, ch)
Outer:
	for {
		var evt Event
		select {
		case evt = <-ch:
		case <-ctx.Done():
			break Outer
		}
		got, _ := json.MarshalIndent(evt, "", "\t")
		fmt.Println("got pubsubhelper event:", string(got))
	}
	return nil
}

// Client is a pubsubhelper client.
type Client struct{}

// StreamEvents streams events,
// sending them to ch until context is canceled.
func (c Client) StreamEvents(ctx context.Context, ch chan<- Event) {
	go c.fetchLoop(ctx, ch)
}

func (c Client) fetchLoop(ctx context.Context, ch chan<- Event) {
	var after time.Time
	for ctx.Err() == nil {
		newAfter, err := c.fetchEvent(ctx, ch, after)
		if err != nil {
			log.Println("fetchEvent:", err)
			select {
			case <-time.After(5 * time.Second):
				continue
			case <-ctx.Done():
				return
			}
		}
		after = newAfter
	}
}

func (c Client) fetchEvent(ctx context.Context, ch chan<- Event, after time.Time) (newAfter time.Time, _ error) {
	var query = make(url.Values)
	if !after.IsZero() {
		query.Set("after", after.Format(time.RFC3339Nano))
	}
	url := (&url.URL{
		Scheme: "https", Host: "pubsubhelper.golang.org", Path: "/waitevent", RawQuery: query.Encode(),
	}).String()
	ctx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return time.Time{}, err
	}
	req = req.WithContext(ctx)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return time.Time{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return time.Time{}, fmt.Errorf("did not get acceptable status code: %v body: %q", resp.Status, body)
	}
	var evt Event
	err = json.NewDecoder(resp.Body).Decode(&evt)
	if err != nil {
		return time.Time{}, err
	}
	if evt.LongPollTimeout {
		return evt.Time, nil
	}
	ch <- evt
	return evt.Time, nil
}

// Event is the type of event that comes out of pubsubhelper.
type Event struct {
	// Time is the time the event was received, or the time of the
	// long poll timeout. This is what clients should send as the
	// "after" URL parameter for the next event.
	Time time.Time

	// LongPollTimeout indicates that no event occurred and the
	// client should retry with ?after=<Time>.
	LongPollTimeout bool `json:",omitempty"`

	// Gerrit is non-nil for Gerrit events.
	Gerrit *GerritEvent `json:",omitempty"`

	// Github is non-nil for GitHub events.
	GitHub *GitHubEvent `json:",omitempty"`
}

// GerritEvent is a type of Event.
type GerritEvent struct {
	// URL is of the form "https://go-review.googlesource.com/39551".
	URL string

	// Project is the Gerrit project on the server, such as "go",
	// "net", "crypto".
	Project string

	// CommitHash is in the Gerrit email headers, so it's included here.
	// I don't dare specify what it means. It seems to be the commit hash
	// that's new or being commented upon. Notably, it doesn't ever appear
	// to be the meta hash for comments.
	CommitHash string

	// ChangeNumber is the number of the change (e.g., 39551).
	ChangeNumber int `json:",omitempty"`
}

// GitHubEvent is a type of Event.
type GitHubEvent struct {
	Action            string // Action is one of: "created" (issue or comment), "labeled", "milestoned", etc.
	RepoOwner         string // E.g., "golang".
	Repo              string // E.g., "go".
	IssueNumber       int    `json:",omitempty"`
	PullRequestNumber int    `json:",omitempty"`
}
