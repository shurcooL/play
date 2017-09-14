// Package sshgit provides functionality for a git server over SSH.
// It's hacky and incomplete, a proof of concept.
package sshgit

import (
	"context"
	"fmt"
	"log"
	"net"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/flynn/go-shlex"
	"golang.org/x/crypto/ssh"
)

// Server is an SSH git server.
type Server struct {
	config *ssh.ServerConfig
	dir    string // Path to root directory containing repositories.
}

// New creates a new SSH git server, using private as the SSH signer,
// and dir as root directory for git repositories.
func New(private ssh.Signer, dir string) *Server {
	config := &ssh.ServerConfig{
		PublicKeyCallback: func(c ssh.ConnMetadata, pubKey ssh.PublicKey) (*ssh.Permissions, error) {
			if c.User() != "git" {
				return nil, fmt.Errorf("unsupported SSH user %q", c.User())
			}
			// TODO: Authentication. Lookup user via SSH public key, get user details and auththorizations, etc.
			return &ssh.Permissions{
				Extensions: map[string]string{
					userLoginKey: "unknown", // TODO.
				},
			}, nil
		},
	}
	config.AddHostKey(private)
	return &Server{
		config: config,
		dir:    dir,
	}
}

// ListenAndServe listens on the TCP network address addr and starts the server.
func (s *Server) ListenAndServe(addr string) error {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	// TODO: Wrap in tcpKeepAliveListener that enables HTTP keep-alives during Accept, if needed.
	return s.serve(ln)
}

func (s *Server) serve(l net.Listener) error {
	defer l.Close()
	for {
		tcpConn, err := l.Accept()
		if err != nil {
			log.Printf("failed to accept incoming connection: %v\n", err)
			continue
		}
		tcpConn.SetDeadline(time.Now().Add(gitTransactionTimeout))
		go s.handleConn(tcpConn)
	}
}

func (s *Server) handleConn(tcpConn net.Conn) {
	defer tcpConn.Close()
	sshConn, chans, reqs, err := ssh.NewServerConn(tcpConn, s.config)
	if err != nil {
		log.Printf("failed to SSH handshake: %v\n", err)
		return
	}
	go ssh.DiscardRequests(reqs)
	for newChannel := range chans {
		s.handleChannel(sshConn, newChannel)
	}
}

func (s *Server) handleChannel(sshConn *ssh.ServerConn, newChannel ssh.NewChannel) {
	if t := newChannel.ChannelType(); t != "session" {
		newChannel.Reject(ssh.UnknownChannelType, fmt.Sprintf("unknown channel type: %v", t))
		return
	}
	ch, reqs, err := newChannel.Accept()
	if err != nil {
		return
	}
	defer ch.Close()
	for req := range reqs {
		fmt.Println("handleChannel: req.Type:", req.Type)
		switch req.Type {
		case "exec":
			if req.WantReply {
				req.Reply(true, nil)
			}
			err := s.handleExec(sshConn, ch, req)
			if err != nil {
				log.Println(err)
			}
			return
		case "shell":
			if req.WantReply {
				req.Reply(true, nil)
			}
			err := s.handleShell(sshConn, ch, req)
			if err != nil {
				log.Println(err)
			}
			return
		default:
			if req.WantReply {
				req.Reply(false, nil)
			}
		}
	}
}

func (s *Server) handleShell(sshConn *ssh.ServerConn, ch ssh.Channel, req *ssh.Request) error {
	_, err := fmt.Fprintf(ch, "Hello %v. You've successfully authenticated, but we don't provide shell access.\n",
		sshConn.Permissions.Extensions[userLoginKey])
	if err != nil {
		return err
	}
	_, err = ch.SendRequest("exit-status", false, ssh.Marshal(statusMsg{Status: 0}))
	if err != nil {
		return fmt.Errorf("ch.SendRequest: %v", err)
	}
	return nil
}

func (s *Server) handleExec(sshConn *ssh.ServerConn, ch ssh.Channel, req *ssh.Request) error {
	if len(req.Payload) < 4 {
		return fmt.Errorf("invalid git transport protocol payload (less than 4 bytes): %q", req.Payload)
	}
	command := string(req.Payload[4:]) // E.g., "git-upload-pack '/user/repo'".
	args, err := shlex.Split(command)  // E.g., []string{"git-upload-pack", "/user/repo"}.
	if err != nil || len(args) != 2 {
		return fmt.Errorf("command %q is not a valid git command", command)
	}
	op := args[0]                     // E.g., "git-upload-pack".
	repo := path.Clean("/" + args[1]) // E.g., "/user/repo".
	repoDir := filepath.Join(s.dir, filepath.FromSlash(repo))
	if repo == "" || !strings.HasPrefix(repoDir, s.dir) {
		fmt.Fprintf(ch.Stderr(), "Specified repo %q lies outside of root.\n\n", repo)
		return fmt.Errorf("specified repo %q lies outside of root", repo)
	}
	userLogin := sshConn.Permissions.Extensions[userLoginKey]

	args = nil
	switch op {
	case "git-upload-pack":
		args = []string{"--strict", "."}

		// git-upload-pack uploads packs back to client. It happens when the client does
		// git fetch or similar.
		// TODO: Check for read access.
		if false {
			fmt.Fprintf(ch.Stderr(), "User %q doesn't have read permissions.\n\n", userLogin)
			return fmt.Errorf("user %q doesn't have read permissions", userLogin)
		}
	case "git-receive-pack":
		args = []string{"."}

		// git-receive-pack receives packs and applies them to the repository. It happens
		// when the client does git push or similar.
		// TODO: Check for write access.
		if true {
			fmt.Fprintf(ch.Stderr(), "User %q doesn't have write permissions.\n\n", userLogin)
			return fmt.Errorf("user %q doesn't have write permissions", userLogin)
		}
	default:
		return fmt.Errorf("%q is not a supported git operation", op)
	}

	// Execute the git operation.
	ctx, cancel := context.WithTimeout(context.Background(), gitTransactionTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, op, args...) //"--timeout", "300",
	cmd.Dir = repoDir
	cmd.Stdin = ch  //io.TeeReader(ch, os.Stdout)
	cmd.Stdout = ch //io.MultiWriter(ch, os.Stdout)
	cmd.Stderr = ch //io.MultiWriter(ch, os.Stderr)
	err = cmd.Start()
	if err != nil {
		return fmt.Errorf("could not start command: %v", err)
	}
	commandError := cmd.Wait()
	if commandError != nil {
		log.Printf("command failed: %v\n", commandError)
	}
	_, err = ch.SendRequest("exit-status", false, ssh.Marshal(statusMsg{Status: exitStatus(commandError)}))
	if err != nil {
		return fmt.Errorf("ch.SendRequest: %v", err)
	}
	return nil
}

func exitStatus(err error) uint32 {
	switch err := err.(type) {
	case nil:
		return 0
	case *exec.ExitError:
		return uint32(err.Sys().(syscall.WaitStatus).ExitStatus())
	default:
		return 1
	}
}

type statusMsg struct {
	Status uint32
}

const userLoginKey = "userLogin"

// gitTransactionTimeout is a timeout for a single git transaction.
const gitTransactionTimeout = 5 * time.Minute
