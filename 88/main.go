package main

import (
	"github.com/shurcooL/go-goon"
	"github.com/sourcegraph/go-vcs/vcs"
	_ "github.com/sourcegraph/go-vcs/vcs/git"
)

func main() {
	repo, err := vcs.Open("git", "/root/audio")
	if err != nil {
		panic(err)
	}

	commitId, err := repo.ResolveRevision("v1")
	if err != nil {
		panic(err)
	}

	goon.DumpExpr(commitId)

	commit, err := repo.GetCommit(commitId)
	if err != nil {
		panic(err)
	}

	goon.DumpExpr(commit)
}
