Specify Web Portal
==================

Requirements
------------

* Ubuntu Server (Tested with 12.04lts)

* Apache Tomcat7

    `sudo apt-get install tomcat7`

* JDK for the `jar` utility

    `sudo apt-get install default-jdk`

* GNUMake

    `sudo apt-get install make`

* Unzip program

    `sudo apt-get install unzip`

* Python (should be installed in Ubuntu by default)

Simple Installation Instructions
-------------------------

These instructions illustrate the fewest steps needed to install the
web portal. For a more advanced configuration providing automatic
updates, see below.

1. Unpack this repository on a server with Apache Tomcat7 installed.
1. Some variables at the top of `Makefile` can be customized, but the
   defaults should be fine for Debian based systems.
1. Use the Specify Data Export tool to create a Web Portal export zip
   file (someone can expand on this) for each collection to be hosted
   in the portal.
1. Copy the zip files into the `specify_exports` directory in this
   directory. The copied files should be given names that are
   suitable for use in URLs; so no spaces, capital letters, slashes or
   other problematic characters. E.g. `kufish.zip`
1. Build the SOLR app: `make clean && make`.
1. Install the newly built Web Portal: `sudo make install && sudo
   invoke-rc.d tomcat7 restart`
1. The portal should now be accessible at
   `http://localhost:8080/specify-solr/` to a browser running on the
   server, assuming default Tomcat configuration.

The Portal can be updated by updating the contents of
`specify_exports` with new exports and repeating the make clean
... restart steps.

Auto Update Instructions
------------------------

1. Decide on a non root account to use for the update process, log in
   to it and download this repository.
1. The account will need to be added to the tomcat7 group. `sudo
   adduser USERNAME tomcat7`.
1. Use `visudo` to give the tomcat7 group the ability to restart
   Tomcat by adding the line:

    `%tomcat7 ALL=(ALL) NOPASSWD: /usr/sbin/invoke-rc.d tomcat7 restart`

1. Edit `Makefile` changing `INSTALL_DIR` to a directory in a location
   writable by the chosen account. For example if the account is
   `webportal`, you could use `/home/webportal/solr-home`.
1. Also in the Makefile change `INSTALL_UID` to the username of the
   update account and `INSTALL_GID` to `tomcat7`.
1. Make the directory pointed to by `SOLR_HOME` a link to
   `INSTALL_DIR`. For example:
   `sudo ln -s /home/webportal/solr-home /var/lib/specify-solr`
1. Use the Specify Data Export tool to create a Web Portal export zip
   file (someone can expand on this) for each collection to be hosted
   in the portal.
1. Copy the zip files into the `specify_exports` directory in this
   directory. The copied files should be given names that are
   suitable for use in URLs; so no spaces, capital letters, slashes or
   other problematic characters. E.g. `kufish.zip`
1. Build the SOLR app: `make clean && make`.
1. Install the Tomcat context file. `sudo make
   install-context-file`. This step requires root and needs only be
   done once unless `SOLR_HOME` is changed.
1. Run `make update` to move the configured portal into place and
   restart Tomcat.
1. Verify the portal is working by visiting
   `http://your.server:8080/specify-solr`.
1. Install a crontab as the update user to execute `make && make
   update` on a periodic schedule. An example crontab is included and
   can be installed with the command `crontab example.crontab`.
1. Now when new exports are copied into `specify_exports` the portal
   will be automatically updated the next time the cron job runs. The
   last update time is shown on the main page.

#### Theory of operation

The makefile target `all` includes the `specify_exports` directory as
a dependency so that changes there will cause the portal app to be
rebuilt. The `update` target depends on the build products of `all`
and will only redo the install and restart the server when those
change. By chaining `make && make update` if the `make` step fails,
`make update` will not be executed. Since the Specify export files are
copied as zip files, if `make` runs during the copy process, one or
more of the files will fail to unzip, aborting `make` and subsequently
preventing `make update`.

Tomcat Configuration
--------------------

While strictly outside the scope of these instructions, you may
wish to make the following configuration changes to Tomcat:

### Making Tomcat use port 80

For Ubuntu, getting Tomcat to listen on the standard HTTP port 80
involves changing two files. In `/etc/default/tomcat7` change
```
#AUTHBIND=no
```
to
```
AUTHBIND=yes
```

Be sure to uncomment the
line in addition to changing it to "yes".

In `/etc/tomcat7/server.xml` change
```
<Connector port="8080" protocol="HTTP/1.1" ...
```
to
```
<Connector port="80" protocol="HTTP/1.1" ...
```

See: [Ref. 1](http://thelowedown.wordpress.com/2010/08/17/tomcat-6-binding-to-a-privileged-port-on-debianubuntu/)


### Making the portal app the "Default" Tomcat servlet

If you would like to have the web portal be the default app so that
the URL is of the form "http://your.server.foo/core-name/" instead of
"http://your.server.foo/specify-solr/core-name/", change the context
file name to `ROOT.xml` in Tomcat config directory. Assuming Ubuntu:

```
cd /etc/tomcat7/Catalina/localhost
sudo mv specify-solr.xml ROOT.xml
```

See: [Ref. 2](http://wiki.apache.org/tomcat/HowTo#How_do_I_make_my_web_application_be_the_Tomcat_default_application.3F)
