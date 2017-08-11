package vcs

import "net/http"

// Repository is a VCS repository.
type Repository interface {
	// FileSystem opens the repository file tree at a given commitID.
	FileSystem(commitID string) (http.FileSystem, error)
}
