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

	return nil
}
