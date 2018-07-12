// A one-off tool to transfer all public repositories from one GitHub account to another.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	githubv3 "github.com/google/go-github/github"
	"golang.org/x/oauth2"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	const (
		dryRun = true
		from   = "dmitshur"
		to     = "shurcooL"
	)

	src := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: os.Getenv("GITHUB_TOKEN")},
	)
	httpClient := oauth2.NewClient(context.Background(), src)

	client := githubv3.NewClient(httpClient)

	repos, _, err := client.Repositories.List(context.Background(), from, &githubv3.RepositoryListOptions{
		ListOptions: githubv3.ListOptions{PerPage: 100},
	})
	if err != nil {
		return err
	}
	fmt.Println("repos:", len(repos))

	for _, repo := range repos {
		fmt.Println("moving:", *repo.Name)

		if !dryRun {
			_, _, err := client.Repositories.Transfer(context.Background(), from, *repo.Name, githubv3.TransferRequest{
				NewOwner: to,
			})
			if _, ok := err.(*githubv3.AcceptedError); ok {
				// No-op.
			} else if err != nil {
				return err
			}
		}

		time.Sleep(time.Second)
	}

	return nil
}
