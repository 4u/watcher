var exec = require('child_process').exec;
var font = require('./font');

var Watcher = function(config) {
  this._config = config;
  this._timers = {};
};

Watcher.prototype.watch = function() {
  var chokidar = require('chokidar');

  this._watchers = [];

  if (this._config.INITIAL_COMMAND && typeof this._config.INITIAL_COMMAND == 'string') {
    var initial = this._config.INITIAL_COMMAND;
    delete this._config.INITIAL_COMMAND;

    process.stdout.write(font.colorize(font.c.Green, "INITIAL: ") + initial + "\n");
    exec(initial, this._printExecResult);
  }

  for(var path in this._config) {
    var config = this._config[path];
    var watcher = chokidar.watch(path, config.options);
    this._watchers.push(watcher);

    watcher
      .on('all', (function(type, file) {
        this._onAll(type, file, path, watcher);
      }).bind(this))
      .on('error', (function(error) {
        this._onError(error, config, watcher);
      }).bind(this));
  }
};

Watcher.prototype.close = function() {
  this._chokidar.close();
  this._chokidar = null;
};

Watcher.prototype._onAll = function(type, file, dir, watcher) {
  var config = this._config[dir];

  // ignoring
  if (config.ignored && config.ignored.test(file)) {
    process.stdout.write(font.colorize(font.c.Red, "IGNORED: ") + file + "\n");
    return;
  }

  // track by mask if defined
  if (config.mask && !config.mask.test(file)) {
    process.stdout.write(font.colorize(font.c.Red, "IGNORED: ") + file + "\n");
    return;
  }

  clearTimeout(this._timers[dir]);
  delete this._timers[dir];

  var tokens = config['do'] || config['command'];

  // has only string command
  if (typeof tokens == "string") {
    process.stdout.write(font.colorize(font.c.Green, "UPDATE: ") + file + "\n");
    this._timers[dir] = this._exec(tokens, config.delay, file);
    return;
  }

  // has stack of commands
  if (tokens.length === undefined) {
    tokens = [tokens];
  }

  var hasRunnedCommand = false;
  tokens.forEach(function(token) {
    // track by mask if defined
    if (token.mask && !token.mask.test(file)) {
      return;
    }

    var timerName = dir + "__" + token.mask;
    clearTimeout(this._timers[timerName]);
    delete this._timers[timerName];

    if (!hasRunnedCommand) {
      process.stdout.write(font.colorize(font.c.Green, "UPDATE: ") + file + "\n");
      hasRunnedCommand = true;
    }
    this._timers[timerName] = this._exec(token.command, token.delay || config.delay, file);
  }, this);

  // has no runned commands
  if (!hasRunnedCommand) {
    process.stdout.write(font.colorize(font.c.Red, "IGNORED: ") + file + "\n");
  }
};

Watcher.prototype._onError = function(error) {
  process.stderr.write(font.colorize(font.c.Red, error));
};

Watcher.prototype._exec = function(command, opt_delay, opt_path) {
  var execFunc = (function() {
    process.stdout.write(font.colorize(font.c.Green, "RUN: ") + command + "\n");
    exec(command, {
      env: opt_path ? this._getEnv(opt_path) : {}
    }, this._printExecResult);
  }).bind(this);

  if (opt_delay) {
    return setTimeout(execFunc, opt_delay);
  }

  execFunc();
  return -1;
};

Watcher.prototype._printExecResult = function(error, stdout, stderr) {
  if (stdout) {
    process.stdout.write(stdout);
  } else if (stderr) {
    process.stderr.write(font.colorize(font.c.Red, stderr));
  } else if (error !== null) {
    process.stderr.write(font.colorize(font.c.Red, error));
  }
};

Watcher.prototype._getEnv = function(path) {
  var p = require('path');
  return {
    WATCHER_PATH: path,
    WATCHER_DIRNAME: p.dirname(path),
    WATCHER_FILENAME: p.basename(path)
  };
};

exports.Watcher = Watcher;
