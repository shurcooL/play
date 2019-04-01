// Play around with listing all issues on dmitri.shuralyov.com.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/shurcooL/issues"
	"github.com/shurcooL/issuesapp/httpclient"
)

func main() {
	err := run(context.Background())
	if err != nil {
		log.Fatalln(err)
	}
}

func run(ctx context.Context) error {
	cl := httpclient.NewIssues(nil, "https", "dmitri.shuralyov.com")
	for _, repo := range []string{
		"dmitri.shuralyov.com/app/changes",
		"dmitri.shuralyov.com/font/woff2",
		"dmitri.shuralyov.com/gpu/mtl",
		"dmitri.shuralyov.com/html/belt",
		"dmitri.shuralyov.com/route/github",
		"dmitri.shuralyov.com/scratch",
		"dmitri.shuralyov.com/service/change",
		"dmitri.shuralyov.com/state",
		"dmitri.shuralyov.com/text/kebabcase",
		"dmitri.shuralyov.com/website/gido",
	} {
		is, err := cl.List(ctx, issues.RepoSpec{URI: repo}, issues.IssueListOptions{
			State: issues.AllStates,
		})
		if err != nil {
			return err
		}
		fmt.Println(repo)
		for _, i := range is {
			fmt.Printf("  %v [%v] %v\n", i.ID, i.State, i.Title)
		}
		fmt.Println()
	}
	return nil
}
