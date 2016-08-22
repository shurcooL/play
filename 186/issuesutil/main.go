// Package issuesutil has a utility to dump all users in a given issues.Service.
package issuesutil

import (
	"context"
	"fmt"

	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/issues"
	"github.com/shurcooL/users"
)

func DumpUsers(ctx context.Context, src issues.Service, repo issues.RepoSpec) error {
	users := make(map[string]int) // User -> Activity Count.

	is, err := src.List(ctx, repo, issues.IssueListOptions{State: issues.AllStates})
	if err != nil {
		return err
	}
	fmt.Printf("Visiting %v issues.\n", len(is))
	for _, i := range is {
		i, err = src.Get(ctx, repo, i.ID) // Needed to get the body, since List operation doesn't include all details.
		if err != nil {
			return err
		}
		// Visit issue.
		users[user(i.User)]++

		comments, err := src.ListComments(ctx, repo, i.ID, nil)
		if err != nil {
			return err
		}
		fmt.Printf("Issue %v: Visiting %v comments.\n", i.ID, len(comments))
		for _, c := range comments {
			if c.ID == 0 { // Skip issue bodies, already counted above.
				continue
			}

			// Visit comment.
			users[user(c.User)]++
			for _, r := range c.Reactions {
				for _, u := range r.Users {
					users[user(u)]++
				}
			}
		}

		events, err := src.ListEvents(ctx, repo, i.ID, nil)
		if err != nil {
			return err
		}
		fmt.Printf("Issue %v: Visiting %v events.\n", i.ID, len(events))
		for _, e := range events {
			// Visit event.
			users[user(e.Actor)]++
		}
	}

	fmt.Println("All done.")

	goon.DumpExpr(users)

	return nil
}

func user(u users.User) string {
	if u.Domain == "" {
		u.Domain = "-"
	}
	return fmt.Sprintf("%v: %s @ %s / %s", u.ID, u.Login, u.Domain, u.HTMLURL)
}
