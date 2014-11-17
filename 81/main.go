package main

import (
	"github.com/shurcooL/go-goon"
	"github.com/sourcegraph/go-vcs/vcs"
	_ "github.com/sourcegraph/go-vcs/vcs/gitcmd"
)

func main() {
	repo, err := vcs.Open("git", "/Users/Dmitri/Downloads/audio")
	if err != nil {
		panic(err)
	}

	commitId, err := repo.ResolveTag("v1")
	if err != nil {
		panic(err)
	}

	commit, err := repo.GetCommit(commitId)
	if err != nil {
		panic(err)
	}

	goon.DumpExpr(commit)
}
