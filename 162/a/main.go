// A small SSH daemon providing bash sessions
//
// Server:
// cd my/new/dir/
// #generate server keypair
// ssh-keygen -t rsa
// go get -v .
// go run sshd.go
//
// Client:
// ssh foo@localhost -p 3022 #pass=bar

package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"strings"

	"github.com/flynn/go-shlex"
	"github.com/shurcooL/go-goon"
	"golang.org/x/crypto/ssh"
)

func main() {
	config := &ssh.ServerConfig{
		PasswordCallback: func(c ssh.ConnMetadata, pass []byte) (*ssh.Permissions, error) {
			// Should use constant-time compare (or better, salt+hash) in a production setting.
			if c.User() == "git" && string(pass) == "abc" {
				return nil, nil
			}
			return nil, fmt.Errorf("password rejected for %q", c.User())
		},

		AuthLogCallback: func(conn ssh.ConnMetadata, method string, err error) {
			log.Printf("ssh: user %q, method %q: %v", conn.User(), method, err)
		},
	}

	// You can generate a keypair with 'ssh-keygen -t rsa'
	hostPrivateKey, err := ioutil.ReadFile("/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/play/162/a/id_rsa")
	if err != nil {
		log.Fatal("Failed to load private key (./id_rsa)")
	}

	hostPrivateKeySigner, err := ssh.ParsePrivateKey(hostPrivateKey)
	if err != nil {
		log.Fatal("Failed to parse private key")
	}

	config.AddHostKey(hostPrivateKeySigner)

	// Once a ServerConfig has been configured, connections can be accepted.
	listener, err := net.Listen("tcp", "0.0.0.0:3022")
	if err != nil {
		log.Fatalf("Failed to listen on 3022 (%s)", err)
	}

	// Accept all connections
	log.Print("Listening on 3022...")
	for {
		tcpConn, err := listener.Accept()
		if err != nil {
			log.Printf("Failed to accept incoming connection (%s)", err)
			continue
		}
		// Before use, a handshake must be performed on the incoming net.Conn.
		sshConn, chans, reqs, err := ssh.NewServerConn(tcpConn, config)
		if err != nil {
			log.Printf("Failed to handshake (%s)", err)
			continue
		}
		go ssh.DiscardRequests(reqs)
		// Accept all channels
		go handleChannels(chans)

		log.Printf("New SSH connection from %s (%s)", sshConn.RemoteAddr(), sshConn.ClientVersion())
	}
}

func handleChannels(chans <-chan ssh.NewChannel) {
	// Service the incoming Channel channel in go routine
	for newChannel := range chans {
		go handleChannel(newChannel)
	}
}

func handleChannel(newChannel ssh.NewChannel) {
	// Since we're handling a shell, we expect a
	// channel type of "session". The also describes
	// "x11", "direct-tcpip" and "forwarded-tcpip"
	// channel types.
	if t := newChannel.ChannelType(); t != "session" {
		newChannel.Reject(ssh.UnknownChannelType, fmt.Sprintf("unknown channel type: %v", t))
		return
	}

	// At this point, we have the opportunity to reject the client's
	// request for another logical connection
	channel, requests, err := newChannel.Accept()
	if err != nil {
		log.Printf("Could not accept channel (%s)", err)
		return
	}

	// Prepare teardown function
	close := func() {
		channel.Close()
		log.Printf("Session closed")
	}

	// Handle requests, primarily "exec".
	go func(requests <-chan *ssh.Request) {
		for req := range requests {
			ok := false
			switch req.Type {
			case "exec":
				handleExec(channel, req)
				close()
				return
				ok = true
			default:
				log.Printf("got a request type %q\n", req.Type)
			}
			req.Reply(ok, nil)
		}
	}(requests)
}

// Payload: uint32: command size, string: command
func handleExec(ch ssh.Channel, req *ssh.Request) {
	goon.DumpExpr(string(req.Payload))
	command := string(req.Payload[4:])
	gitCmds := []string{"git-receive-pack", "git-upload-pack"}

	valid := false
	for _, cmd := range gitCmds {
		if strings.HasPrefix(command, cmd) {
			valid = true
		}
	}
	if !valid {
		log.Printf("command %q %v is not a GIT command\n", command, len(req.Payload))
		ch.Write([]byte("command is not a GIT command\r\n"))
		return
	}

	log.Printf("well done! (command was %q %v)\n", command, len(req.Payload))
	if err := foo(command); err != nil {
		log.Println(err)
		return
	}
	ch.Write([]byte("well done!\r\n"))
}

func foo(command string) error {
	cmdargs, err := shlex.Split(command)
	if err != nil || len(cmdargs) != 2 {
		return fmt.Errorf("invalid arguments: %v", err)
	}

	goon.DumpExpr(cmdargs)
	return nil
}
