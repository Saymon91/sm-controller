const { EventEmitter } = require('events');

const template = {
  init(context) {
    return {
      onEnter: function () {
        this.log('init');
        this.log(`${this.container.name} INITIALISED`);
      }.bind(context),
      onError: function (err) {
        this.log(`ERROR: ${err.message} INITIALISED`);
        this.log(err.stack);
      }.bind(context),
      targets: {
        event1: function () {
          return 's1'
        }.bind(context)
      }
    }
  },
  s1(context) {
    return {
      onEnter: function () {
        this.log('s1');
        this.test = this.test ? this.test + 1 : 1;
      }.bind(context),
      onExit: function () {

      }.bind(context),
      onError: function () {

      }.bind(context),
      targets: {
        event2: function () {
          return 's2';
        }.bind(context),
        fin   : function() {
          return 'finish'
        }.bind(context)
      }
    }
  },
  s2(context) {
    return {
      onEnter: function () {
        this.log('s2');
        setTimeout(() => {
          this.container.gen('start');
      }, 2000);
      }.bind(context),
      onError: function () {

      }.bind(context),
      targets: {
        start: function () {
          return this.state < 5 ? 's1' : 'finish';
        }.bind(context)
      }
    }
  },
  finish(context) {
    return {
      onEnter: function () {
        this.log('FINISH');
      }.bind(context),
      onExit: function () {

      }.bind(context),
      onError: function () {

      }.bind(context)
    }
  }
};

class Conteroller extends EventEmitter {
  constructor(template = {}, context = [], options = {}) {
    super();
    Object.assign(this, { template, context, options });

    this.state = null;
    this.states = {};
    this.interpreter = null;
    this.history = [];
    this.queue = [];

    this.build(template);
  }

  build(template) {
    for (const state in template) {
      this.states = template[state](this.context);
    }
  }

  gen(event, data) {
    if (!this.interpreter) {
      return false;
    }
    Object.assign(this.context, data);
    this.interpreter.next(event);
  }

  start() {
    this.interpreter = (function* () {
      this.state = 'init';
      this.safe(() => this.emit('on-enter', this.state));
      this.safe(this.states[this.state].onEnter, this.states[this.state].onError);

      while (this.state !== 'finish') {
        const event = yield;
        if (event === 'force-finish') {
          break;
        }
        if (!this.states[this.state][event]) {
          continue;
        }
        const target = this.safe(this.states[this.state][event], this.states[this.state].onError);
        if (!target) {
          continue;
        }
        this.history.push({ [this.state]: target });
        this.safe(this.states[this.state].onExit, this.states[this.state].onError);
        this.safe(() => this.emit('on-exit', this.state));
        this.state = target;
        this.safe(() => this.emit('on-enter', this.state));
        this.safe(this.states[this.state].onEnter, this.states[this.state].onError);
      }

      this.state = 'finish';
      this.safe(this.states[this.state].onExit, this.states[this.state].onError);
      this.interpreter = null;
    }.bind(this))()
  }

  safe(handler, errorHandler = null) {
    if (typeof handler !== 'function') {
      return false;
    }

    let result = false;
    try {
      result = handler()
    } catch (handlerError) {
      try {
        if (errorHandler instanceof Function) {
          try {
            errorHandler(handlerError);
          } catch (errorHandlerError) {
            try {
              this.emit('error', errorHandlerError)
            } catch (e) {}
          }
        }
        this.emit('error', handlerError);
      } catch (e) {}
    }

    return result;
  }

  finish(force) {
    if (!this.interpreter) {
      return true;
    }

    if (force) {
      this.interpreter.next('force-finish');
    }
  }

  onFinish(callback) {
    callback instanceof Function && this.once('finished', callback);
  }
  onError(callback) {
    callback instanceof Function && this.on('error', callback);
  }
  inState(state) {
    return this.state === state;
  }

  onEnter(callback) {
    callback instanceof Function && this.once('on-enter', callback);
  }
  onExit(callback) {
    callback instanceof Function && this.once('on-exit', callback);
  }

}

const c = new Conteroller(template)
