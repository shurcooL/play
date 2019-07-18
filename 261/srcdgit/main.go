// Play with walking Go repositories via src-d/go-git.v4.
package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path"
	"strings"

	"gopkg.in/src-d/go-git.v4"
	"gopkg.in/src-d/go-git.v4/plumbing"
	"gopkg.in/src-d/go-git.v4/plumbing/filemode"
	"gopkg.in/src-d/go-git.v4/plumbing/object"
	"gopkg.in/src-d/go-git.v4/storage/memory"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	var existingDirectories = make(map[string]struct{})
	for servProj, repoRoot := range gerritProjects {
		for _, branch := range []string{"master", "release-branch.go1.12", "release-branch.go1.11"} {
			dirs, err := walkRepositoryBranch("https://"+servProj, repoRoot, branch)
			if err == errBranchNotFound && branch != "master" {
				// Skip missing release branch.
				continue
			} else if err != nil {
				return fmt.Errorf("walkRepositoryBranch(%q, %q, %q): %v", "https://"+servProj, repoRoot, branch, err)
			}
			for d := range dirs {
				existingDirectories[d] = struct{}{}
			}
		}
	}
	for dir := range existingDirectories {
		fmt.Println(dir)
	}
	return nil
}

// gerritProjects maps each supported Gerrit "server/project" to
// the import path that corresponds to the root of that project.
var gerritProjects = map[string]string{
	"go.googlesource.com/go":         "",
	"go.googlesource.com/arch":       "golang.org/x/arch",
	"go.googlesource.com/benchmarks": "golang.org/x/benchmarks",
	"go.googlesource.com/blog":       "golang.org/x/blog",
	"go.googlesource.com/build":      "golang.org/x/build",
	"go.googlesource.com/crypto":     "golang.org/x/crypto",
	"go.googlesource.com/debug":      "golang.org/x/debug",
	"go.googlesource.com/exp":        "golang.org/x/exp",
	"go.googlesource.com/image":      "golang.org/x/image",
	"go.googlesource.com/lint":       "golang.org/x/lint",
	"go.googlesource.com/mobile":     "golang.org/x/mobile",
	"go.googlesource.com/net":        "golang.org/x/net",
	"go.googlesource.com/oauth2":     "golang.org/x/oauth2",
	"go.googlesource.com/perf":       "golang.org/x/perf",
	"go.googlesource.com/playground": "golang.org/x/playground",
	"go.googlesource.com/review":     "golang.org/x/review",
	"go.googlesource.com/sync":       "golang.org/x/sync",
	"go.googlesource.com/sys":        "golang.org/x/sys",
	"go.googlesource.com/talks":      "golang.org/x/talks",
	"go.googlesource.com/term":       "golang.org/x/term",
	"go.googlesource.com/text":       "golang.org/x/text",
	"go.googlesource.com/time":       "golang.org/x/time",
	"go.googlesource.com/tools":      "golang.org/x/tools",
	"go.googlesource.com/tour":       "golang.org/x/tour",
	"go.googlesource.com/vgo":        "golang.org/x/vgo",
}

func walkRepositoryBranch(repoURL, repoRoot, branch string) (map[string]struct{}, error) {
	r, err := git.Clone(memory.NewStorage(), nil, &git.CloneOptions{
		URL:           repoURL,
		ReferenceName: plumbing.NewBranchReferenceName(branch),
		SingleBranch:  true,
		Depth:         1,
		Tags:          git.NoTags,
	})
	if err != nil && err.Error() == fmt.Sprintf("couldn't find remote ref %q", plumbing.NewBranchReferenceName(branch)) {
		return nil, errBranchNotFound
	} else if err != nil {
		return nil, err
	}
	head, err := r.Head()
	if err != nil {
		return nil, err
	}
	commit, err := r.CommitObject(head.Hash())
	if err != nil {
		return nil, err
	}
	tree, err := r.TreeObject(commit.TreeHash)
	if err != nil {
		return nil, err
	}
	if repoRoot == "" {
		// Walk "/src" subdirectory of main Go repository.
		tree, err = subTree(r, tree, "src")
		if err != nil {
			return nil, err
		}
	}
	var dirs = make(map[string]struct{})
	type treePath struct {
		*object.Tree
		Path string
	}
	for frontier := []treePath{{Tree: tree}}; len(frontier) > 0; frontier = frontier[1:] {
		t := frontier[0]

		// Enqueue subdirectories.
		for _, e := range t.Entries {
			if e.Mode != filemode.Dir {
				// We only care about directories.
				continue
			}
			if strings.HasPrefix(e.Name, ".") || strings.HasPrefix(e.Name, "_") || e.Name == "testdata" {
				continue
			}

			tree, err := r.TreeObject(e.Hash)
			if err != nil {
				return nil, err
			}
			frontier = append(frontier, treePath{
				Tree: tree,
				Path: path.Join(t.Path, e.Name),
			})
		}

		// Process this directory.
		if repoRoot == "" && t.Path == "" {
			// Skip root of "/src" of main Go repository.
			continue
		}
		dirs[path.Join(repoRoot, t.Path)] = struct{}{}
	}
	return dirs, nil
}

var errBranchNotFound = errors.New("branch not found")

// subTree looks non-recursively for a directory with the given name in t,
// and returns the corresponding tree.
// If a directory with such name doesn't exist in t, it returns os.ErrNotExist.
func subTree(r *git.Repository, t *object.Tree, name string) (*object.Tree, error) {
	for _, e := range t.Entries {
		if e.Name != name {
			continue
		}
		return r.TreeObject(e.Hash)
	}
	return nil, os.ErrNotExist
}
