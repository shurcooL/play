// Play with a debug implementation of issues.CopierFrom interface.
package main

import (
	"context"
	"fmt"
	"log"

	"src.sourcegraph.com/apps/tracker/issues"
	ghissues "src.sourcegraph.com/apps/tracker/issues/github"
)

type service struct{}

func (s service) CopyFrom(src issues.Service, repo issues.RepoSpec) error {
	ctx := context.TODO()

	is, err := src.List(ctx, repo, issues.IssueListOptions{State: issues.AllStates})
	if err != nil {
		return err
	}
	fmt.Printf("Copying %v issues.\n", len(is))
	for _, issue := range is {
		// TODO: Copy issue.
		_ = issue

		comments, err := src.ListComments(ctx, repo, issue.ID, nil)
		if err != nil {
			return err
		}
		fmt.Printf("Issue %v: Copying %v comments.\n", issue.ID, len(comments))
		for _, comment := range comments {
			// TODO: Copy comment.
			_ = comment
		}

		events, err := src.ListEvents(ctx, repo, issue.ID, nil)
		if err != nil {
			return err
		}
		fmt.Printf("Issue %v: Copying %v events.\n", issue.ID, len(events))
		for _, event := range events {
			// TODO: Copy event.
			_ = event
		}
	}

	return nil
}

func main() {
	src := ghissues.NewService(nil)

	err := service{}.CopyFrom(src, issues.RepoSpec{URI: "shurcooL/vfsgen"})
	if err != nil {
		log.Fatalln(err)
	}
}

/*func main() {
	src, err := wordpress.NewService("/Users/Dmitri/Dropbox/Work/2013/Mini Projects/shurcool.wordpress.com/shurcool039sblog.wordpress.2014-02-21.xml")
	if err != nil {
		log.Fatalln(err)
	}

	err = fs.NewService("/Users/Dmitri/Desktop/foo").(issues.CopierFrom).CopyFrom(src, issues.RepoSpec{URI: "shurcooL/vfsgen"})
	if err != nil {
		log.Fatalln(err)
	}
}*/
