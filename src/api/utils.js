
import log from '../../log'

const catchAsync = fn => (
    (req, res, next) => {
        const routePromise = fn(req, res, next);
        if (routePromise.catch) {
            routePromise.catch(err => next(err));
        }
    }
);

const _sendError = (res, msg, code = 400) => {
    log.error(msg);
    res.status(code).send({
        status: 'error',
        message: msg
    });
}

export {
    catchAsync,
    _sendError
}