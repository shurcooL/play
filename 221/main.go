// Play with various ways of encoding events.
package main

import (
	"bytes"
	"compress/gzip"
	"encoding/gob"
	"fmt"
	"log"
)

func main() {
	gob.Register(IssuesEvent{})
	gob.Register(PullRequestEvent{})

	var network bytes.Buffer

	/*
	   json = 133

	   gob = 253
	   gob + gzip = 207
	   gob + gzip(best) = 207
	*/

	{
		gw, err := gzip.NewWriterLevel(&network, gzip.BestCompression)
		if err != nil {
			log.Fatalln(err)
		}
		enc := gob.NewEncoder(gw)
		// Encode (send) some values.
		var e Event = IssuesEvent{Action: "opened", Issue: "Some new bug", Assignee: "shurcooL"}
		err = enc.Encode(&e)
		if err != nil {
			log.Fatalln("encode error:", err)
		}
		e = PullRequestEvent{Action: "merged", Number: 123, PullRequest: "Fix all the bugs"}
		err = enc.Encode(&e)
		if err != nil {
			log.Fatalln("encode error:", err)
		}
		err = gw.Close()
		if err != nil {
			log.Fatalln("close error:", err)
		}
	}

	fmt.Println(network.Len())
	//fmt.Println(network.Bytes())

	{
		r, err := gzip.NewReader(&network)
		if err != nil {
			log.Fatalln(err)
		}
		dec := gob.NewDecoder(r) // Will read from network.
		// Decode (receive) and print the values.
		var e Event
		err = dec.Decode(&e)
		if err != nil {
			log.Fatalln("decode error 1:", err)
		}
		fmt.Printf("%#v\n", e)
		err = dec.Decode(&e)
		if err != nil {
			log.Fatalln("decode error 2:", err)
		}
		fmt.Printf("%#v\n", e)
		err = dec.Decode(&e)
		fmt.Println(err)
	}
}

type Event interface{}

type IssuesEvent struct {
	// Action is the action that was performed. Possible values are: "assigned",
	// "unassigned", "labeled", "unlabeled", "opened", "closed", "reopened", "edited".
	Action   string `json:"action,omitempty"`
	Issue    string `json:"issue,omitempty"`
	Assignee string `json:"assignee,omitempty"`
	Label    string `json:"label,omitempty"`
}

type PullRequestEvent struct {
	// Action is the action that was performed. Possible values are: "assigned",
	// "unassigned", "labeled", "unlabeled", "opened", "closed", or "reopened",
	// "synchronize", "edited". If the action is "closed" and the merged key is false,
	// the pull request was closed with unmerged commits. If the action is "closed"
	// and the merged key is true, the pull request was merged.
	Action      string `json:"action,omitempty"`
	Number      int    `json:"number,omitempty"`
	PullRequest string `json:"pull_request,omitempty"`
}
