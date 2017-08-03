// Play with x/build/maintner/godata.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/shurcooL/go-goon"
	"golang.org/x/build/maintner"
	"golang.org/x/build/maintner/godata"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	corpus, err := godata.Get(context.Background())
	if err != nil {
		return err
	}

	if false {
		statuses := make(map[string]int)
		err = corpus.Gerrit().ForeachProjectUnsorted(func(p *maintner.GerritProject) error {
			return p.ForeachCLUnsorted(func(cl *maintner.GerritCL) error {
				statuses[cl.Status] = statuses[cl.Status] + 1
				if cl.Status == "draft" {
					fmt.Println(cl.Project.ServerSlashProject(), cl.Number)
				}
				return nil
			})
		})
		if err != nil {
			return err
		}
		goon.DumpExpr(statuses)
	}

	{
		err = corpus.GitHub().ForeachRepo(func(r *maintner.GitHubRepo) error {
			fmt.Println(r.ID())
			if r.ID() == (maintner.GithubRepoID{Owner: "go", Repo: "golang"}) {
				var issues int
				err = r.ForeachIssue(func(i *maintner.GitHubIssue) error {
					issues++
					return nil
				})
				if err != nil {
					return err
				}
				fmt.Println("issues:", issues)
			}
			return nil
		})
		if err != nil {
			return err
		}
	}

	return nil
}
